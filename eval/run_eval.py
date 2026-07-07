"""
ACQ Advisor — Evaluation Harness
Runs golden Q&A pairs against the live API and reports accuracy.
Demonstrates Python proficiency + eval framework engineering.

Usage: python run_eval.py [--url https://joshua-tibbetts.thetelosway.com]
"""

import json
import time
import sys
import urllib.request
import urllib.error

API_URL = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].startswith("http") else "https://joshua-tibbetts.thetelosway.com"

GOLDEN_PAIRS = [
    {
        "question": "What is a Grand Slam Offer?",
        "expected_concepts": ["cannot be compared", "unmatchable value", "premium price", "guarantee"],
        "book": "$100M Offers"
    },
    {
        "question": "What is the value equation?",
        "expected_concepts": ["dream outcome", "perceived likelihood", "time delay", "effort and sacrifice"],
        "book": "$100M Offers"
    },
    {
        "question": "How should I price my offer?",
        "expected_concepts": ["premium", "price", "value", "commodit"],
        "book": "$100M Offers"
    },
    {
        "question": "What makes a good lead magnet?",
        "expected_concepts": ["give away", "email", "exchange", "attention"],
        "book": "$100M Leads"
    },
    {
        "question": "How do I generate leads?",
        "expected_concepts": ["lead", "audience", "content", "outreach"],
        "book": "$100M Leads"
    },
    {
        "question": "What's the difference between warm and cold outreach?",
        "expected_concepts": ["warm", "cold", "know", "stranger"],
        "book": "$100M Leads"
    },
    {
        "question": "How do I name my offer?",
        "expected_concepts": ["name", "wrapper", "perception", "industry"],
        "book": "$100M Offers"
    },
    {
        "question": "What are bonuses and how should I use them?",
        "expected_concepts": ["bonus", "value", "stack", "offer"],
        "book": "$100M Offers"
    },
    {
        "question": "How do I scale my advertising?",
        "expected_concepts": ["advertis", "scale", "spend", "return"],
        "book": "$100M Leads"
    },
    {
        "question": "What should I do if my business is stuck?",
        "expected_concepts": ["constrain", "bottleneck", "grow", "offer"],
        "book": "$100M Offers"
    }
]

def call_api(question: str) -> dict:
    """Send a question to the API and return the response with timing."""
    payload = json.dumps({
        "messages": [{"role": "user", "content": question}]
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{API_URL}/api/chat",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "ACQ-Advisor-Eval/1.0"
        },
        method="POST"
    )

    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            data = json.loads(res.read().decode("utf-8"))
            data["_eval_latency_ms"] = int((time.time() - start) * 1000)
            return data
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}", "reply": "", "_eval_latency_ms": int((time.time() - start) * 1000)}
    except Exception as e:
        return {"error": str(e), "reply": "", "_eval_latency_ms": int((time.time() - start) * 1000)}


def score_response(response: dict, expected_concepts: list) -> dict:
    """Score a response against expected concepts."""
    reply = (response.get("reply") or "").lower()
    hits = [c for c in expected_concepts if c.lower() in reply]
    misses = [c for c in expected_concepts if c.lower() not in reply]

    return {
        "concept_recall": len(hits) / len(expected_concepts) if expected_concepts else 0,
        "hits": hits,
        "misses": misses,
        "has_error": bool(response.get("error")),
        "retrieval_scores": response.get("metrics", {}).get("retrieval", {}).get("scores", []),
        "chunks_used": response.get("metrics", {}).get("retrieval", {}).get("chunksUsed", 0),
        "latency_ms": response.get("_eval_latency_ms", 0)
    }


def run_eval():
    print(f"\n{'='*60}")
    print(f"  ACQ Advisor — Evaluation Harness")
    print(f"  API: {API_URL}")
    print(f"  Golden pairs: {len(GOLDEN_PAIRS)}")
    print(f"{'='*60}\n")

    results = []

    for i, pair in enumerate(GOLDEN_PAIRS, 1):
        print(f"[{i}/{len(GOLDEN_PAIRS)}] {pair['question']}")

        response = call_api(pair["question"])
        score = score_response(response, pair["expected_concepts"])
        results.append(score)

        status = "PASS" if score["concept_recall"] >= 0.5 else "FAIL"
        icon = "PASS" if status == "PASS" else "FAIL"

        print(f"  {icon} Recall: {score['concept_recall']:.0%} | "
              f"Chunks: {score['chunks_used']} | "
              f"Latency: {score['latency_ms']}ms | "
              f"Scores: {', '.join(f'{s:.3f}' for s in score['retrieval_scores'][:3])}")

        if score["misses"]:
            print(f"    Missing: {', '.join(score['misses'])}")

        if score["has_error"]:
            print(f"    ERROR: {response.get('error')}")

        # Rate limit courtesy
        time.sleep(2)

    # Summary
    passing = sum(1 for r in results if r["concept_recall"] >= 0.5)
    avg_recall = sum(r["concept_recall"] for r in results) / len(results)
    avg_latency = sum(r["latency_ms"] for r in results) / len(results)
    avg_chunks = sum(r["chunks_used"] for r in results) / len(results)

    print(f"\n{'='*60}")
    print(f"  RESULTS")
    print(f"{'='*60}")
    print(f"  Pass rate:      {passing}/{len(results)} ({passing/len(results):.0%})")
    print(f"  Avg recall:     {avg_recall:.0%}")
    print(f"  Avg latency:    {avg_latency:.0f}ms")
    print(f"  Avg chunks:     {avg_chunks:.1f}")
    print(f"{'='*60}\n")

    # Exit code: 0 if >70% pass, 1 otherwise
    sys.exit(0 if passing / len(results) >= 0.7 else 1)


if __name__ == "__main__":
    run_eval()
