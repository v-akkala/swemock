class Outbox:
    """Collects the messages the service wants users to see."""

    def __init__(self):
        self._messages = []

    def send(self, user, message):
        self._messages.append((user, message))

    def messages_for(self, user):
        """Messages for one user, oldest first."""
        return [m for u, m in self._messages if u == user]

    def all(self):
        """Every (user, message) pair, oldest first."""
        return list(self._messages)
