"""
Inventory Analytics Module
--------------------------
Python script for analyzing inventory data from the database.
Generates reports and detects anomalies.

Usage:
    python analytics.py --org <organizationId> [--report] [--anomalies]

Requirements:
    pip install psycopg2-binary pandas python-dotenv tabulate
"""

import os
import sys
import argparse
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

try:
    import psycopg2
    import pandas as pd
    from tabulate import tabulate
except ImportError:
    print("Installing required packages...")
    os.system("pip install psycopg2-binary pandas python-dotenv tabulate")
    import psycopg2
    import pandas as pd
    from tabulate import tabulate


def get_connection():
    """Connect to Prisma Postgres database."""
    db_url = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL or DIRECT_URL not found in .env")
    return psycopg2.connect(db_url)


def get_inventory_report(conn, org_id: str) -> pd.DataFrame:
    """Generate inventory status report for an organization."""
    query = """
        SELECT
            p.name,
            p.sku,
            p.quantity,
            p."lowStockAt",
            p.price::float,
            (p.quantity * p.price::float) AS total_value,
            CASE
                WHEN p.quantity = 0 THEN 'Out of Stock'
                WHEN p."lowStockAt" IS NOT NULL AND p.quantity <= p."lowStockAt" THEN 'Low Stock'
                ELSE 'In Stock'
            END AS status,
            p."createdAt"
        FROM "Product" p
        WHERE p."organizationId" = %s
        ORDER BY p.quantity ASC
    """
    return pd.read_sql_query(query, conn, params=(org_id,))


def get_anomaly_alerts(conn, org_id: str, days: int = 7) -> pd.DataFrame:
    """Get recent anomaly alerts."""
    query = """
        SELECT
            a."productName",
            a."previousQty",
            a."newQty",
            a."percentageDrop",
            a."createdAt",
            a.status
        FROM "Alert" a
        WHERE a."organizationId" = %s
          AND a.type = 'ANOMALY'
          AND a."createdAt" >= NOW() - INTERVAL '%s days'
        ORDER BY a."createdAt" DESC
    """
    return pd.read_sql_query(query, conn, params=(org_id, days))


def get_top_performers(conn, org_id: str) -> pd.DataFrame:
    """Get leaderboard data."""
    query = """
        SELECT
            m."displayName",
            m.email,
            m.role,
            COUNT(sa.id) AS total_actions,
            SUM(CASE WHEN sa.type = 'PRODUCT_CREATED' THEN 10
                     WHEN sa.type = 'PRODUCT_UPDATED' THEN 5
                     WHEN sa.type = 'INVENTORY_CHECKED' THEN 1
                     ELSE 0 END) AS points
        FROM "Member" m
        LEFT JOIN "StaffAction" sa ON sa."memberId" = m.id
        WHERE m."organizationId" = %s
        GROUP BY m.id, m."displayName", m.email, m.role
        ORDER BY points DESC
    """
    return pd.read_sql_query(query, conn, params=(org_id,))


def get_weekly_trend(conn, org_id: str) -> pd.DataFrame:
    """Get weekly product creation trend."""
    query = """
        SELECT
            DATE_TRUNC('week', "createdAt") AS week,
            COUNT(*) AS products_added
        FROM "Product"
        WHERE "organizationId" = %s
          AND "createdAt" >= NOW() - INTERVAL '12 weeks'
        GROUP BY week
        ORDER BY week
    """
    return pd.read_sql_query(query, conn, params=(org_id,))


def print_report(org_id: str):
    """Print full analytics report."""
    conn = get_connection()

    print(f"\n{'='*60}")
    print(f"  INVENTORY ANALYTICS REPORT")
    print(f"  Organization: {org_id}")
    print(f"  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*60}\n")

    # Inventory status
    df = get_inventory_report(conn, org_id)
    if df.empty:
        print("No products found.")
    else:
        print("📦 INVENTORY STATUS")
        print("-" * 40)
        summary = df.groupby("status").agg(
            count=("name", "count"),
            total_value=("total_value", "sum")
        ).reset_index()
        print(tabulate(summary, headers="keys", tablefmt="rounded_outline", floatfmt=".2f"))

        print(f"\nTotal inventory value: ${df['total_value'].sum():,.2f}")
        print(f"Total products: {len(df)}")

        # Low stock items
        low = df[df["status"].isin(["Low Stock", "Out of Stock"])]
        if not low.empty:
            print(f"\n⚠️  LOW/OUT OF STOCK ({len(low)} items)")
            print(tabulate(
                low[["name", "sku", "quantity", "lowStockAt", "status"]],
                headers=["Name", "SKU", "Qty", "Alert At", "Status"],
                tablefmt="rounded_outline"
            ))

    # Anomaly alerts
    print("\n🚨 RECENT ANOMALY ALERTS (last 7 days)")
    print("-" * 40)
    alerts = get_anomaly_alerts(conn, org_id)
    if alerts.empty:
        print("No anomalies detected.")
    else:
        print(tabulate(alerts, headers="keys", tablefmt="rounded_outline", floatfmt=".1f"))

    # Top performers
    print("\n🏆 TOP PERFORMERS")
    print("-" * 40)
    performers = get_top_performers(conn, org_id)
    if performers.empty:
        print("No activity recorded.")
    else:
        print(tabulate(performers, headers="keys", tablefmt="rounded_outline"))

    # Weekly trend
    print("\n📈 WEEKLY TREND (last 12 weeks)")
    print("-" * 40)
    trend = get_weekly_trend(conn, org_id)
    if not trend.empty:
        for _, row in trend.iterrows():
            bar = "█" * int(row["products_added"])
            print(f"  {str(row['week'])[:10]}  {bar} {int(row['products_added'])}")

    conn.close()
    print(f"\n{'='*60}\n")


def detect_anomalies(org_id: str):
    """Detect potential inventory anomalies."""
    conn = get_connection()

    query = """
        SELECT
            p.name,
            p.quantity,
            p."lowStockAt",
            AVG(p.quantity) OVER (PARTITION BY p."organizationId") AS avg_qty
        FROM "Product" p
        WHERE p."organizationId" = %s
    """
    df = pd.read_sql_query(query, conn, params=(org_id,))

    if df.empty:
        print("No products to analyze.")
        conn.close()
        return

    # Products significantly below average
    threshold = df["avg_qty"].mean() * 0.2
    anomalies = df[df["quantity"] < threshold]

    if anomalies.empty:
        print("✅ No anomalies detected.")
    else:
        print(f"⚠️  {len(anomalies)} potential anomalies found:")
        print(tabulate(anomalies, headers="keys", tablefmt="rounded_outline", floatfmt=".1f"))

    conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inventory Analytics")
    parser.add_argument("--org", required=True, help="Organization ID")
    parser.add_argument("--report", action="store_true", help="Generate full report")
    parser.add_argument("--anomalies", action="store_true", help="Detect anomalies")

    args = parser.parse_args()

    if args.report:
        print_report(args.org)
    elif args.anomalies:
        detect_anomalies(args.org)
    else:
        print_report(args.org)
