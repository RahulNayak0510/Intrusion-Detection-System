"""Tests for the Isolation Forest anomaly scoring wrapper.

These tests do not require live traffic, network access, or MySQL.
All synthetic data is generated locally.
"""
from __future__ import annotations

import numpy as np
import pytest

from app.anomaly.features import FEATURE_NAMES, extract_flow_features, vector_from_parsed_event
from app.anomaly.model import AnomalyModel
from app.ingestion.parser import normalize_event, parse_eve_line


def _event(bytes_ts, bytes_tc, age, dst_port=443, proto="TCP"):
    line = (
        '{"timestamp":"2026-10-09T12:00:10.000000+0000","flow_id":%d,"event_type":"flow",'
        '"src_ip":"10.0.0.1","src_port":1000,"dest_ip":"10.0.0.2","dest_port":%d,"proto":"%s",'
        '"flow":{"pkts_toserver":2,"pkts_toclient":2,"bytes_toserver":%d,"bytes_toclient":%d,"age":%d}}'
    ) % (np.random.randint(1, 1_000_000), dst_port, proto, bytes_ts, bytes_tc, age)
    return normalize_event(parse_eve_line(line))


def test_feature_extractor_exists_for_flow_events():
    e = _event(1000, 2000, 10)
    ff = extract_flow_features(e)
    assert ff is not None
    assert ff.bytes_toserver == 1000
    assert ff.bytes_toclient == 2000
    assert ff.duration_seconds == 10


def test_vector_has_expected_dimensionality():
    e = _event(1000, 2000, 10)
    v = vector_from_parsed_event(e)
    assert v is not None
    assert len(v) == len(FEATURE_NAMES)
    # no NaN / inf
    for x in v:
        assert np.isfinite(x)


def test_model_scores_outlier_higher_than_inlier():
    """Sanity: an extreme outlier must have a higher score than a typical flow."""
    rng = np.random.default_rng(seed=0)
    model = AnomalyModel()

    normal_vecs = []
    for _ in range(200):
        e = _event(
            bytes_ts=int(rng.integers(1000, 50_000)),
            bytes_tc=int(rng.integers(1000, 200_000)),
            age=int(rng.integers(5, 120)),
            dst_port=int(rng.choice([443, 80, 53, 22, 3306])),
            proto="TCP",
        )
        normal_vecs.append(vector_from_parsed_event(e))

    model.fit(normal_vecs)

    # An extreme outlier: 1000x more bytes, an unusual port, very long duration
    outlier = _event(bytes_ts=500_000_000, bytes_tc=500_000_000, age=10_000, dst_port=55555, proto="TCP")
    inlier = _event(bytes_ts=8000, bytes_tc=80_000, age=30, dst_port=443, proto="TCP")

    score_out, feat_out = model.predict(vector_from_parsed_event(outlier))
    score_in, feat_in = model.predict(vector_from_parsed_event(inlier))

    assert score_out is not None
    assert score_in is not None
    assert 0.0 <= score_out <= 1.0
    assert 0.0 <= score_in <= 1.0

    # The outlier score must be strictly higher than the inlier score by a clear margin
    assert score_out > score_in + 0.2, (
        f"Outlier score {score_out} should be noticeably higher than inlier {score_in}"
    )

    # Feature contributions heuristic must return data for the outlier
    assert feat_out is not None
    assert "_label" in feat_out
    assert isinstance(feat_out.get("top"), list) and len(feat_out["top"]) >= 1
    # Each feature must have the explicit heuristic notice
    for t in feat_out["top"]:
        assert "feature" in t and "note" in t
        assert "NOT proof" in t["note"] or "Heuristic" in t["note"]


def test_scorer_ignores_non_flow_events():
    """Only flow events receive a score; others return (None, None)."""
    line = '{"timestamp":"2026-10-09T12:00:01.000000+0000","event_type":"alert","src_ip":"10.0.0.1","dest_ip":"10.0.0.2","alert":{"signature":"X","severity":1}}'
    ev = normalize_event(parse_eve_line(line))
    assert ev.event_type == "alert"
    model = AnomalyModel()
    model.ensure_fitted()
    s, f = model.score_parsed_event(ev)
    assert s is None
    assert f is None
