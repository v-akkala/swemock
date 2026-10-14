# Vending Machine

`catalog.py` (file 1) provides coins, products, the stock, and the error types. Implement `machine.py` (file 2): a `VendingMachine` that takes coins, sells products, and returns change.

## Provided (catalog.py)

- `COINS`: the accepted coins in cents, largest first: `(100, 25, 10, 5)`.
- `Product(code, name, price)` (price in cents) and `Inventory`: `product(code)`, `quantity(code)`, `add_stock(code, qty)`, `remove_one(code)`.
- Errors, all subclasses of `VendingError`: `InvalidCoinError`, `UnknownProductError`, `SoldOutError`, `InsufficientFundsError` (carries `needed`, the missing cents), and `CannotMakeChangeError`.

## API of `VendingMachine`

- `VendingMachine(inventory)`.
- `insert(coin)` accepts one coin (an int from `COINS`); anything else raises `InvalidCoinError` and changes nothing.
- `balance()` returns the cents inserted so far.
- `state()` returns `"idle"` when nothing is inserted and `"has_money"` otherwise.
- `select(code)` sells the product:
  - unknown code: `UnknownProductError`; sold out: `SoldOutError`; balance below the price: `InsufficientFundsError` (with `needed` set). **Nothing changes on an error**: the money stays inserted.
  - otherwise the product is removed from the stock and `select` returns `(product, change)`, where `change` is a list of coins totalling `balance - price`, using the **fewest coins**, largest first (empty if exact). The balance returns to 0.
- `cancel()` returns the coins inserted, as a list sorted largest first, and resets the balance to 0 (an empty list if nothing was inserted).

## Notes

The machine has an unlimited supply of coins to give as change. Keep each method's job clear, and think about what shape would make a new payment method or a new rule easy to add.
