"""Fold Cartesia Ink turn events into one transcript.

A pause ends a turn inside Cartesia. It does not end the candidate's answer.
`turn.end` text is appended exactly as Cartesia sent it, including its own spacing.
"""


class SpokenTranscript:
    def __init__(self) -> None:
        self.completed = ""
        self.current = ""

    def text(self) -> str:
        return self.completed + self.current

    def apply(self, message: object) -> str | None:
        """Return the full text when this event changes it. A resume does not."""
        if not isinstance(message, dict):
            return None
        kind = message.get("type")
        transcript = message.get("transcript")
        if kind in {"turn.update", "turn.eager_end"}:
            if not isinstance(transcript, str):
                return None
            self.current = transcript
            return self.text()
        if kind == "turn.end":
            if not isinstance(transcript, str):
                return None
            self.completed += transcript
            self.current = ""
            return self.text()
        return None
