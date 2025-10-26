import json
import math
import os
import threading
import webbrowser
from flask import Flask, jsonify, render_template, request, Response
import requests


app = Flask(__name__)

API_URL = "https://www.microburbs.com.au/report_generator/api/suburb/properties"
API_HEADERS = {
    "Authorization": "Bearer test",
    "Content-Type": "application/json",
}

_ALLOWED_ORIGINS = {
    "http://localhost",
    "http://localhost:3000",
    "http://127.0.0.1",
    "http://127.0.0.1:3000",
}


def clean_nans(obj):
    if isinstance(obj, dict):
        return {key: clean_nans(value) for key, value in obj.items()}
    if isinstance(obj, list):
        return [clean_nans(item) for item in obj]
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    return obj


@app.after_request
def add_cors_headers(response: Response) -> Response:
    origin = request.headers.get("Origin")
    if origin in _ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        response.headers["Vary"] = "Origin"
    return response


@app.route("/")
def index() -> str:
    return render_template("index.html")


@app.route("/property")
def property_detail() -> str:
    return render_template("detail.html")


@app.route("/api/properties")
def proxy_properties() -> Response:
    suburb = request.args.get("suburb")
    if not suburb:
        return jsonify({"error": "Missing required query parameter: suburb"}), 400

    try:
        upstream_response = requests.get(
            API_URL,
            headers=API_HEADERS,
            params={"suburb": suburb},
            timeout=10,
        )
    except requests.RequestException as exc:
        return jsonify({"error": f"Upstream request failed: {exc}"}), 502

    if not upstream_response.ok:
        return (
            jsonify(
                {
                    "error": (
                        f"Upstream responded with status {upstream_response.status_code}"
                    )
                }
            ),
            502,
        )

    try:
        payload = upstream_response.json()
    except ValueError:
        return jsonify({"error": "Upstream response was not valid JSON"}), 502

    def normalize_list(raw_obj):
        if isinstance(raw_obj, list):
            return raw_obj
        if isinstance(raw_obj, dict):
            for key in ("properties", "results", "data"):
                if key in raw_obj:
                    nested = normalize_list(raw_obj[key])
                    if isinstance(nested, list):
                        return nested
        return []

    normalized = normalize_list(payload)
    if not isinstance(normalized, list):
        normalized = []

    cleaned = clean_nans(normalized)

    return Response(
        json.dumps(cleaned, allow_nan=False),
        status=200,
        mimetype="application/json",
    )


if __name__ == "__main__":
    def _launch_browser() -> None:
        try:
            webbrowser.open_new("http://127.0.0.1:5000/")
        except Exception as exc:  # pragma: no cover - best effort
            app.logger.warning("Unable to open browser automatically: %s", exc)

    if os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        threading.Timer(1.0, _launch_browser).start()
    app.run(debug=True)
