# Python Analytics Module

Inventory management system-ийн analytics болон anomaly detection module.

## Setup

```bash
cd python
pip install -r requirements.txt
```

## Usage

```bash
# Full inventory report
python analytics.py --org <organizationId> --report

# Anomaly detection only
python analytics.py --org <organizationId> --anomalies
```

## Features

- 📦 Inventory status report (In Stock / Low Stock / Out of Stock)
- 💰 Total inventory value calculation
- 🚨 Anomaly alert history
- 🏆 Staff leaderboard with points
- 📈 Weekly product trend chart

## Example Output

```
============================================================
  INVENTORY ANALYTICS REPORT
  Organization: cmo3za5xk0051bp98eckzxz5n
  Generated: 2026-04-18 14:30
============================================================

📦 INVENTORY STATUS
----------------------------------------
╭──────────────┬───────┬─────────────╮
│ status       │ count │ total_value │
├──────────────┼───────┼─────────────┤
│ In Stock     │    15 │   450000.00 │
│ Low Stock    │     3 │    45000.00 │
│ Out of Stock │     2 │        0.00 │
╰──────────────┴───────┴─────────────╯
```
