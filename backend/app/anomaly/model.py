from __future__ import annotations

import math
from typing import Any

import numpy as np

from app.anomaly.features import FEATURE_NAMES, vector_from_parsed_event
from app.core.config import settings
from app.core.logging_setup import get_logger
from app.ingestion.parser import ParsedEvent

log = get_logger(module="anomaly_model")


class AnomalyModel:
    """Isolation Forest wrapper. Disabled until ANOMALY_ENABLED=true.

    - Starts from a deterministic synthetic baseline. Callers may pass real
      flow vectors to fit(), but this wrapper does not load data from the DB.
    - Scores flow events only; all other event types return (None, None).
    - Feature contribution heuristic: z-score vs training mean/std.
      LABELLED CLEARLY AS HEURISTIC, NOT A ROOT-CAUSE EXPLANATION.
    """

    def __init__(self) -> None:
        from sklearn.ensemble import IsolationForest
        self._cls = IsolationForest
        self._model: Any = None
        self._feature_means: np.ndarray | None = None
        self._feature_stds: np.ndarray | None = None
        self._n_trained: int = 0
        self._min_samples_for_fit = 50
        self._fitted = False

    # --------------------------------------------------------------
    def _baseline_synthetic(self, n: int = 200) -> np.ndarray:
        """Create synthetic benign flow distribution to bootstrap the model."""
        rng = np.random.default_rng(seed=42)
        vecs = []
        for _ in range(n):
            bytes_ts = math.log1p(int(rng.integers(500, 500_000)))
            bytes_tc = math.log1p(int(rng.integers(1_000, 2_000_000)))
            pkts_ts = math.log1p(int(rng.integers(5, 500)))
            pkts_tc = math.log1p(int(rng.integers(8, 800)))
            dur = math.log1p(max(0.0, rng.normal(30, 60)))
            port_hash = rng.random()
            proto_enc = rng.choice([0.1, 0.2, 0.7, 0.9])
            total_bytes = math.expm1(bytes_ts) + math.expm1(bytes_tc)
            b_ratio = math.expm1(bytes_ts) / total_bytes if total_bytes > 0 else 0.0
            total_pkts = math.expm1(pkts_ts) + math.expm1(pkts_tc)
            p_ratio = math.expm1(pkts_ts) / total_pkts if total_pkts > 0 else 0.0
            vecs.append([
                float(bytes_ts), float(bytes_tc), float(pkts_ts), float(pkts_tc), float(dur),
                float(port_hash), float(proto_enc), float(b_ratio), float(p_ratio),
            ])
        return np.asarray(vecs, dtype=np.float32)

    def fit(self, vectors: list[list[float]] | None = None) -> None:
        from sklearn.ensemble import IsolationForest
        import numpy as np

        X: np.ndarray
        if vectors and len(vectors) >= self._min_samples_for_fit:
            X = np.asarray(vectors, dtype=np.float32)
        else:
            X = self._baseline_synthetic()
        self._feature_means = X.mean(axis=0)
        std = X.std(axis=0)
        std[std < 1e-6] = 1.0
        self._feature_stds = std
        self._model = IsolationForest(
            n_estimators=100,
            max_samples="auto",
            contamination=0.05,
            random_state=42,
            n_jobs=1,
        )
        self._model.fit(X)
        self._n_trained = X.shape[0]
        self._fitted = True
        log.info("anomaly_model_fit", samples=self._n_trained, synthetic=(vectors is None or len(vectors) < self._min_samples_for_fit))

    def ensure_fitted(self) -> None:
        if self._fitted:
            return
        self.fit()

    # --------------------------------------------------------------
    def predict(self, vector: list[float]) -> tuple[float | None, dict[str, Any] | None]:
        self.ensure_fitted()
        if self._model is None or self._feature_means is None or self._feature_stds is None:
            return None, None
        import numpy as np
        vec = np.asarray(vector, dtype=np.float32).reshape(1, -1)
        raw = self._model.score_samples(vec)[0]
        # score_samples returns negative (higher = more normal). Map to [0,1] with 1=most anomalous.
        # Typical range of IF scores for sane data is ~[-0.7, -0.35]; map with sigmoid clamp.
        score = float(raw)
        # map: higher score (less negative) → more normal. We want 1 = most anomalous.
        norm = 1.0 - 1.0 / (1.0 + math.exp((score + 0.55) * 12.0))
        norm = float(max(0.0, min(1.0, norm)))

        # Heuristic feature contributions: |z-score| per feature. Return top-K.
        z = np.abs((vec.reshape(-1) - self._feature_means) / self._feature_stds)
        order = np.argsort(-z)
        top = []
        for idx in order[:4]:
            i = int(idx)
            top.append({
                "feature": FEATURE_NAMES[i],
                "z_score": float(z[i]),
                "note": (
                    "Heuristic only: larger |z| vs training mean/std suggests unusualness. "
                    "NOT proof of intrusion."
                ),
            })
        contrib = {
            "_label": "HEURISTIC_FEATURE_CONTRIBUTIONS — ESTIMATES ONLY, NOT ROOT CAUSE",
            "top": top,
        }
        return norm, contrib

    # --------------------------------------------------------------
    def score_parsed_event(self, p: ParsedEvent) -> tuple[float | None, dict | None]:
        if p.event_type != "flow":
            return None, None
        vec = vector_from_parsed_event(p)
        if vec is None:
            return None, None
        try:
            return self.predict(vec)
        except Exception as e:
            log.warn("anomaly_predict_error", err=repr(e))
            return None, None


_singleton: AnomalyModel | None = None


def get_scorer() -> AnomalyModel:
    global _singleton
    if _singleton is None:
        _singleton = AnomalyModel()
        _singleton.ensure_fitted()
    return _singleton


def anomaly_scorer_fn(p: ParsedEvent) -> tuple[float | None, dict | None]:
    """Callable used by ingestion reader when ANOMALY_ENABLED=true."""
    scorer = get_scorer()
    return scorer.score_parsed_event(p)
