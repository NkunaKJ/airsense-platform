import os

import psycopg
from fastapi import APIRouter
from psycopg.rows import dict_row

router = APIRouter(prefix="/models", tags=["models"])

DATABASE_URL = os.environ["DATABASE_URL"]


@router.get("/results")
def model_results():
    """Final test scores and the model chosen for each city, with every
    candidate's validation score (this feeds the Analysis page)."""
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        results = conn.execute(
            """SELECT r.*, c.name AS city_name
               FROM model_results r
               LEFT JOIN cities c ON c.key = r.city_key
               ORDER BY r.city_key"""
        ).fetchall()
        candidates = conn.execute(
            """SELECT city_key, model_name, cv_mae, params, is_selected
               FROM model_candidates ORDER BY city_key, cv_mae"""
        ).fetchall()

    by_city = {}
    for c in candidates:
        by_city.setdefault(c["city_key"], []).append(
            {k: c[k] for k in ("model_name", "cv_mae", "params", "is_selected")}
        )
    out = []
    for r in results:
        base = r["baseline_test_mae"]
        r["improvement_pct"] = (
            round((1 - r["test_mae"] / base) * 100, 1) if base else None
        )
        r["candidates"] = by_city.get(r["city_key"], [])
        out.append(r)
    return out