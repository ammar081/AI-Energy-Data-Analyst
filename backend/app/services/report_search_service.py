from html.parser import HTMLParser

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.models.db import ReportRecord


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        text = " ".join(data.split())
        if text:
            self.parts.append(text)


def html_to_search_text(html: str) -> str:
    parser = _TextExtractor()
    parser.feed(html)
    return " ".join(parser.parts)


def _excerpt(text: str, query: str, length: int = 240) -> str:
    lowered = text.lower()
    positions = [lowered.find(term) for term in query.lower().split() if lowered.find(term) >= 0]
    start = max(min(positions, default=0) - 60, 0)
    snippet = text[start : start + length].strip()
    if start > 0:
        snippet = f"...{snippet}"
    if start + length < len(text):
        snippet = f"{snippet}..."
    return snippet


def search_reports(reports: list[ReportRecord], query: str, limit: int = 10) -> list[tuple[ReportRecord, float, str]]:
    clean_query = " ".join(query.split())[:300]
    if not reports or not clean_query:
        return []
    documents = [report.search_text for report in reports]
    try:
        matrix = TfidfVectorizer(stop_words="english", ngram_range=(1, 2)).fit_transform([*documents, clean_query])
    except ValueError:
        return []
    scores = cosine_similarity(matrix[-1], matrix[:-1]).ravel()
    ranked = sorted(enumerate(scores), key=lambda item: item[1], reverse=True)
    return [
        (reports[index], round(float(score), 4), _excerpt(documents[index], clean_query))
        for index, score in ranked[: max(1, min(limit, 20))]
        if score > 0
    ]
