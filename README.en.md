# Quórum (English overview)

> Quórum is an investment committee for Argentine portfolios, self-hosted. The application and its documentation are in Spanish; this page is the English summary.

## What it is

Quórum is a web application built with **Django** and **Celery**. It reads Argentine market data (BYMA, Yahoo Finance, ArgentinaDatos, CoinGecko, DolarAPI) every business day, stores it, and runs the calculations behind a "committee" of 14 agents that review your portfolio.

- **Screener:** the top 10 stocks, CEDEARs, bonds, T-bills and corporate bonds, ranked by expected return against risk.
- **Risk in USD:** volatility, VaR and CVaR over 10 days, maximum drawdown, Sharpe and Sortino, beta and alpha against the Merval (measured in USD MEP).
- **Strategy:** carry, implied devaluation of dollar-linked bonds and inflation breakeven against CER.
- **Measurement:** every selection is measured at 30, 90 and 180 days against the Merval in USD, so you can check whether the screener is right.
- **Rebalancing:** tolerance bands by asset group, suggested sales, and "invest without selling": new money goes to the groups below target.

## What it does not do

- It does **not** place orders. You execute trades in your own broker.
- It does **not** decide for you. Two agents (the guardian and compliance) can veto a purchase; every decision is recorded with its reason.
- It is **not financial advice.** Data comes from public sources that can be late or wrong.

## Quick start with Docker

```bash
git clone https://github.com/lucasbauducco/quorum.git
cd quorum
cp .env.example .env          # set DJANGO_SECRET_KEY
docker compose up --build -d
docker compose exec web python manage.py createsuperuser
```

Open <http://localhost:8000/quorum/>. Optionally load market history with `docker compose exec web python manage.py cargar_historia` (takes a few minutes).

Without Docker, see the installation section of the [Spanish README](README.md#instalación).

## Tests

```bash
python manage.py test          # 31 Django tests
node tests/js/rebalanceo.test.js
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and pull requests in Spanish or English are welcome.

## License

MIT. See [LICENSE](LICENSE).
