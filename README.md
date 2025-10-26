# Microburbs Property Explorer

This dashboard surfaces investor-friendly insights from the Microburbs Sandbox, letting you explore listing volumes and price signals for Australian suburbs. It normalizes the upstream schema into a consistent array so the UI can render defensively even when fields differ between responses. The first end-to-end iteration was designed and built in roughly one hour.

## Run Locally
```bash
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```
Navigate to `http://127.0.0.1:5000` and start querying suburbs.

## UI Preview
![Overview](https://raw.githubusercontent.com/pranavkalal/microburbs-dashboard/main/docs/overview.png)
![Property Grid](https://raw.githubusercontent.com/pranavkalal/microburbs-dashboard/main/docs/property-grid.png)

## What You’ll See
- Sticky summary badges with listing count, suburb name, median price (with average), and active property type.
- Responsive property cards showing address, price, bedrooms, and bathrooms, with skeleton placeholders during fetch.
- Alerts, empty states, and sorting controls that react gracefully to changing or incomplete data.

## Defensive Data Handling
The Flask proxy unwraps nested `data/results/properties` payloads, coerces NaN/∞ to `null`, and always returns an array. The front end mirrors this by normalizing keys case-insensitively, flattening nested numeric fields, and handling unknown schemas without breaking the layout.

## What’s Next
Add richer filters, trend charts, and configurable investment metrics to deepen the suburb analysis.
