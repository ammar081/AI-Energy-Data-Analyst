# Dataset Sources

The committed `sample/solar_operations_sample.csv` file is synthetic demo data created for this project. It is safe to publish and is not presented as measured plant telemetry.

For larger portfolio experiments, download data from the provider and keep its original license or attribution file beside your local copy. Large raw datasets should not be committed to this repository.

## Renewable Energy

- [NREL Data Catalog](https://data.nrel.gov/) - solar, wind, grid, and building-energy datasets from the US National Renewable Energy Laboratory.
- [Open Power System Data](https://open-power-system-data.org/) - time-series electricity generation, demand, weather, and capacity data for Europe.
- [ENTSO-E Transparency Platform](https://transparency.entsoe.eu/) - European electricity generation, load, transmission, and balancing data. Registration may be required.
- [Kaggle Solar Power Generation Data](https://www.kaggle.com/datasets/anikannal/solar-power-generation-data) - plant generation and weather sensor data suitable for the included column mapper.

## Weather

- [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) - hourly historical weather data with no API key for non-commercial use within its published terms.
- [Meteostat](https://dev.meteostat.net/) - open weather and climate observations available through Python and bulk downloads.

## Useful Columns

The analyzer works best when a file includes a timestamp, an output metric, and an asset identifier. Capacity, status, irradiation, temperature, wind, and humidity fields unlock additional KPIs and explanations.
