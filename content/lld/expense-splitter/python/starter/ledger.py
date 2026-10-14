from money import LedgerError, split_evenly


class Ledger:
    """Tracks who owes whom after shared expenses. See the spec for the contract."""

    def add_expense(self, payer: str, amount: int, participants: list) -> None:
        """`payer` paid `amount` cents; split it equally among `participants`."""
        raise NotImplementedError

    def balance(self, user: str) -> int:
        """Net balance in cents: positive means the user is owed, negative means the user owes."""
        raise NotImplementedError

    def balances(self) -> dict:
        """Every user with a non-zero balance."""
        raise NotImplementedError

    def settle(self, payer: str, receiver: str, amount: int) -> None:
        """`payer` hands `amount` cents to `receiver`."""
        raise NotImplementedError

    def simplify(self) -> list:
        """(debtor, creditor, amount) transfers that would zero every balance."""
        raise NotImplementedError
