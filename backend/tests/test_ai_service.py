from app.services import ai_service


class _FakeInteraction:
    output_text = (
        '{"what_happened":"Output fell.","why_it_matters":"Delivery may be affected.",'
        '"possible_reason":"A cause is not proven.","suggested_next_step":"Review operations records."}'
    )


class _FakeInteractions:
    def create(self, **kwargs):
        assert kwargs["response_format"]["mime_type"] == "application/json"
        return _FakeInteraction()


class _FakeClient:
    interactions = _FakeInteractions()

    def close(self) -> None:
        pass


def test_gemini_response_is_validated_with_pydantic(monkeypatch) -> None:
    monkeypatch.setattr(ai_service, "_client", lambda: _FakeClient())

    result = ai_service.explain_findings("Why did output fall?", {"answer": "Output fell."})

    assert result is not None
    assert result.what_happened == "Output fell."
