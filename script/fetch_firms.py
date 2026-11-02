import os, io, json, hashlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import requests
import geopandas as gpd
from shapely.geometry import Point

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
PBPH_FILE = DATA / "pbph.geojson"
HISTORY_FILE = DATA / "hotspot_history.csv"
OUTPUT_GEOJSON = DATA / "hotspot.geojson"
OUTPUT_CSV = DATA / "hotspot.csv"
API_KEY = os.environ["FIRMS_MAP_KEY"]

# FIRMS near-real-time sources. MODIS_SP (standard processing) is
# intentionally excluded from the operational NRT feed.
SENSORS = [
    "VIIRS_SNPP_NRT",
    "VIIRS_NOAA20_NRT",
    "VIIRS_NOAA21_NRT",
    "MODIS_NRT",
]
DAYS = 2
HISTORY_DAYS = 7

def empty_outputs():
    fc = {"type": "FeatureCollection", "name": "TMK NASA FIRMS hotspots", "features": []}
    OUTPUT_GEOJSON.write_text(json.dumps(fc), encoding="utf-8")
    pd.DataFrame().to_csv(OUTPUT_CSV, index=False)

def main():
    if not API_KEY:
        raise RuntimeError("FIRMS_MAP_KEY belum diatur pada GitHub Secrets.")

    pbph = gpd.read_file(PBPH_FILE).to_crs("EPSG:4326")
    if pbph.empty:
        raise RuntimeError("pbph.geojson tidak memiliki fitur.")
    if not pbph.geometry.is_valid.all():
        raise RuntimeError("Geometri PBPH tidak valid. Periksa pbph.geojson.")

    west, south, east, north = pbph.total_bounds
    area = f"{west},{south},{east},{north}"
    fetched = []

    for sensor in SENSORS:
        url = (
            "https://firms.modaps.eosdis.nasa.gov/api/area/csv/"
            f"{API_KEY}/{sensor}/{area}/{DAYS}"
        )
        try:
            response = requests.get(url, timeout=90)
            response.raise_for_status()
            body = response.text.strip()
            if not body or "latitude" not in body.lower():
                print(f"{sensor}: tidak ada baris data.")
                continue
            frame = pd.read_csv(io.StringIO(body))
            if not frame.empty:
                frame["source"] = sensor
                fetched.append(frame)
            print(f"{sensor}: {len(frame)} baris dari area bounding box.")
        except Exception as exc:
            print(f"PERINGATAN {sensor}: {exc}")

    if not fetched:
        print("Tidak ada data yang berhasil diambil; riwayat sebelumnya dipertahankan.")
        if HISTORY_FILE.exists():
            history = pd.read_csv(HISTORY_FILE)
        else:
            empty_outputs()
            return
    else:
        incoming = pd.concat(fetched, ignore_index=True)
        incoming["latitude"] = pd.to_numeric(incoming["latitude"], errors="coerce")
        incoming["longitude"] = pd.to_numeric(incoming["longitude"], errors="coerce")
        incoming = incoming.dropna(subset=["latitude", "longitude"])

        pts = gpd.GeoDataFrame(
            incoming,
            geometry=gpd.points_from_xy(incoming.longitude, incoming.latitude),
            crs="EPSG:4326",
        )
        inside = gpd.sjoin(
            pts, pbph[["geometry"]],
            how="inner", predicate="intersects"
        ).drop(columns=["geometry", "index_right"], errors="ignore")

        if not inside.empty:
            inside["record_id"] = inside.apply(
                lambda r: hashlib.sha1(
                    "|".join(str(r.get(c, "")) for c in
                             ["latitude", "longitude", "acq_date", "acq_time", "satellite", "instrument"]).encode()
                ).hexdigest()[:20], axis=1
            )
            incoming_history = inside
        else:
            incoming_history = pd.DataFrame()

        if HISTORY_FILE.exists():
            old = pd.read_csv(HISTORY_FILE)
            history = pd.concat([old, incoming_history], ignore_index=True)
        else:
            history = incoming_history

    if history.empty:
        empty_outputs()
        return

    history = history.drop_duplicates(subset=["record_id"], keep="last")
    history["acq_date"] = history["acq_date"].astype(str)
    cutoff = (datetime.now(timezone.utc).date() - timedelta(days=HISTORY_DAYS-1)).isoformat()
    history = history[history["acq_date"] >= cutoff].copy()
    history.to_csv(HISTORY_FILE, index=False)

    # Latest rolling 7-day view for dashboard
    history.to_csv(OUTPUT_CSV, index=False)

    props = history.drop(columns=[], errors="ignore").to_dict(orient="records")
    features = []
    for row in props:
        lat, lon = float(row["latitude"]), float(row["longitude"])
        clean = {}
        for k, v in row.items():
            if k == "geometry":
                continue
            if pd.isna(v):
                clean[k] = None
            elif hasattr(v, "item"):
                clean[k] = v.item()
            else:
                clean[k] = v
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": clean,
        })

    collection = {
        "type": "FeatureCollection",
        "name": "TMK NASA FIRMS hotspots - rolling 7 days",
        "features": features,
    }
    OUTPUT_GEOJSON.write_text(
        json.dumps(collection, ensure_ascii=False, allow_nan=False),
        encoding="utf-8",
    )
    print(f"Selesai: {len(history)} hotspot dalam wilayah PBPH TMK (rolling 7 hari).")

if __name__ == "__main__":
    main()
