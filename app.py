import json
import os
import re
from datetime import datetime
from difflib import get_close_matches

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from requests.auth import HTTPBasicAuth

load_dotenv()

app = Flask(__name__, static_folder="dist", static_url_path="")
CORS(app)

# ENV
TOGETHER_API_KEY = os.getenv("TOGETHER_API_KEY")
TOGETHER_MODEL = os.getenv("TOGETHER_MODEL")
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")

SAP_BASE_URL = "http://52.172.11.94:8001"
SAP_SERVICE = "/sap/opu/odata/SAP/ZINV_STATUS_SRV"
SAP_AUTH = HTTPBasicAuth("XYZ", "xyz")
HEADERS = {"Accept": "application/json"}

# Load intents
with open("intents.json") as f:
    INTENTS = json.load(f)

# In-memory follow-up
memory = {}

@app.route("/")
def index():
    return app.send_static_file("index.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("dist", path)

@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json()
    message = data.get("message", "").strip()
    context = data.get("context", "").strip()

    if not message:
        return jsonify({"response": "Please enter a valid message."})

    new_intent = detect_intent(message, INTENTS)

    if "awaiting" in memory:
        awaiting = memory.get("awaiting")
        if isinstance(awaiting, dict):
            previous_intent = awaiting.get("intent")
            task = awaiting.get("task")
        else:
            previous_intent = None
            task = awaiting

        if new_intent != previous_intent:
            if new_intent != "fallback" or any(x in message.lower() for x in ["weather", "time", "date"]):
                memory.clear()
        else:
            if task == "po_number":
                if previous_intent == "purchase_order":
                    response = get_po_status(message)
                    if "PO fetch failed" in response:
                        memory["awaiting"] = {"task": "po_number", "intent": "purchase_order"}
                    return jsonify({"response": response})

            if task == "invoice_number":
                memory["invoice_number"] = message
                memory["awaiting"] = {"task": "invoice_date", "intent": "invoice_status"}
                return jsonify({"response": "Please provide the invoice date (YYYY-MM-DD)."})

            if task == "invoice_date":
                invoice_no = memory.pop("invoice_number", None)
                if previous_intent == "invoice_status":
                    return jsonify({"response": get_invoice_status(invoice_no, message)})

    intent = new_intent

    if intent == "purchase_order":
        po_number = extract_number(message)
        if po_number:
            response = get_po_status(po_number)
            if "PO fetch failed" in response:
                memory["awaiting"] = {"task": "po_number", "intent": "purchase_order"}
            return jsonify({"response": response})
        else:
            memory["awaiting"] = {"task": "po_number", "intent": "purchase_order"}
            return jsonify({"response": "Please provide the PO number."})

    if intent == "invoice_status":
        invoice_no, invoice_date = extract_invoice_details(message)
        if invoice_no and invoice_date:
            return jsonify({"response": get_invoice_status(invoice_no, invoice_date)})
        elif invoice_no:
            memory["invoice_number"] = invoice_no
            memory["awaiting"] = {"task": "invoice_date", "intent": "invoice_status"}
            return jsonify({"response": "Please provide the invoice date (YYYY-MM-DD)."})
        else:
            memory["awaiting"] = {"task": "invoice_number", "intent": "invoice_status"}
            return jsonify({"response": "Please provide the invoice number."})

    if intent == "greetings":
        memory.clear()
        return jsonify({"response": "Hello! How can I assist you today?"})

    if "weather" in message.lower():
        memory.clear()
        return jsonify({"response": get_weather(message)})

    if "time" in message.lower():
        memory.clear()
        return jsonify({"response": get_time(message)})

    memory.clear()
    return jsonify({"response": call_together_api(message, context)})

# === Intent matcher ===
def detect_intent(message, intents):
    message_lower = message.lower()
    for intent_name, intent_data in intents.items():
        keywords = intent_data.get("keywords", [])
        matches = get_close_matches(message_lower, keywords, n=1, cutoff=0.6)
        if matches:
            return intent_name
    return "fallback"

# === SAP Handlers ===
def get_po_status(po_number):
    url = f"{SAP_BASE_URL}{SAP_SERVICE}/POStatusSet('{po_number}')?$format=json&sap-client=100"
    try:
        r = requests.get(url, headers=HEADERS, auth=SAP_AUTH)
        if r.ok:
            return format_po_response(r.json())
        else:
            return f"PO fetch failed: {r.status_code} – {extract_error_text(r.text)}"
    except Exception as e:
        return f"Error contacting SAP for PO: {e}"

def get_invoice_status(invoice_no, invoice_date):
    try:
        invoice_date_iso = datetime.strptime(invoice_date, "%Y-%m-%d").strftime("%Y-%m-%dT00:00:00")
        url = f"{SAP_BASE_URL}{SAP_SERVICE}/InvoiceStatusSet(Invoice_Number='{invoice_no}',Invoice_Date=datetime'{invoice_date_iso}')?$format=json&sap-client=100"
        r = requests.get(url, headers=HEADERS, auth=SAP_AUTH)
        if r.ok:
            return format_invoice_response(r.json())
        else:
            return f"Invoice fetch failed: {r.status_code} – {extract_error_text(r.text)}"
    except Exception as e:
        return f"Error contacting SAP for Invoice: {e}"

# === Formatters ===
def format_po_response(data):
    d = data.get("d", {})
    po_number = d.get('PO_Number', 'N/A')
    po_status = d.get('PO_Status', '').strip()
    del_ind = d.get('Del_Ind', '').strip()
    if not po_status and del_ind:
        po_status = "PO might be deleted"
    elif not po_status:
        po_status = "No status available"
    return f"PO {po_number} is *{po_status}* (Del: {del_ind if del_ind else 'None'})."

def format_invoice_response(data):
    d = data.get("d", {})
    invoice_number = d.get("Invoice_Number", "N/A")
    invoice_status = d.get("Invoice_Status", "").strip() or "No status available"
    invoice_date = convert_sap_date(d.get("Invoice_Date", ""))
    amount = d.get("Amount", "").strip() or "N/A"
    return f"Invoice {invoice_number} is *{invoice_status}* dated {invoice_date if invoice_date else 'N/A'} with amount ₹{amount}."

# === Weather ===
def get_weather(message):
    city_match = re.search(r'in\s+([a-zA-Z\s]+)', message.lower())
    city = city_match.group(1).strip() if city_match else "Delhi"
    url = f"https://api.openweathermap.org/data/2.5/weather?q={city}&appid={OPENWEATHER_API_KEY}&units=metric"
    try:
        r = requests.get(url)
        data = r.json()
        if r.status_code == 200 and "main" in data:
            temp = data["main"]["temp"]
            condition = data["weather"][0]["description"].title()
            return f"The current weather in {city.title()} is {condition} with a temperature of {temp}°C."
        else:
            return f"Could not fetch weather for {city.title()}."
    except Exception as e:
        return f"Weather fetch error: {e}"

# === Time ===
def get_time(message):
    city_match = re.search(r'in\s+([a-zA-Z\s]+)', message.lower())
    city = city_match.group(1).strip() if city_match else "Delhi"
    try:
        geo = requests.get(f"http://api.openweathermap.org/geo/1.0/direct?q={city}&limit=1&appid={OPENWEATHER_API_KEY}").json()
        if not geo:
            return f"Could not locate city: {city.title()}"
        lat, lon = geo[0]["lat"], geo[0]["lon"]
        time_data = requests.get(f"https://timeapi.io/api/Time/current/coordinate?latitude={lat}&longitude={lon}").json()
        local_time = time_data.get("time", None)
        if local_time:
            return f"The current time in {city.title()} is {local_time}."
        else:
            return f"Unable to retrieve time for {city.title()}."
    except Exception as e:
        return f"Time fetch error: {e}"

# === Utils ===
def convert_sap_date(sap_date):
    match = re.search(r'/Date\((\d+)\)/', sap_date)
    if match:
        millis = int(match.group(1))
        return datetime.utcfromtimestamp(millis / 1000).strftime('%d-%b-%Y')
    return sap_date

def extract_number(text):
    match = re.search(r'\d{5,}', text)
    return match.group(0) if match else None

def extract_invoice_details(text):
    invoice_no = extract_number(text)
    date_match = re.search(r'\b(20\d{2})[/-]?(\d{2})[/-]?(\d{2})\b', text)
    if date_match:
        y, m, d = date_match.groups()
        return invoice_no, f"{y}-{m}-{d}"
    return invoice_no, None

def extract_error_text(response_text):
    try:
        if response_text.strip().startswith('{'):
            error_data = json.loads(response_text)
            return error_data.get("error", {}).get("message", {}).get("value", "SAP returned an error.")
        soup = BeautifulSoup(response_text, "html.parser")
        title = soup.title.string if soup.title else "SAP Error"
        message = soup.find("p", class_="centerText")
        return f"{title}: {message.text.strip()}" if message else title
    except Exception:
        return "SAP returned an error."

# === LLM Fallback ===
def call_together_api(prompt, context=""):
    url = "https://api.together.xyz/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {TOGETHER_API_KEY}",
        "Content-Type": "application/json"
    }
    messages = []
    if context:
        messages.append({"role": "system", "content": context})
    messages.append({"role": "user", "content": prompt})
    body = {
        "model": TOGETHER_MODEL,
        "messages": messages
    }
    try:
        r = requests.post(url, headers=headers, json=body)
        data = r.json()
        print("Together API response:", data)  # <-- Add this line
        if "choices" in data:
            return data["choices"][0]["message"]["content"].strip()
        return "Unexpected response from LLM."
    except Exception as e:
        return f"LLM API error: {e}"

# === Main Entrypoint ===
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))  # changed default to 5001
    app.run(host="0.0.0.0", port=port)
