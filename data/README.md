# Dataset Sources

The committed generation, demand, and maintenance CSV files under `sample/` are synthetic demo data created for this project. They are safe to publish and are not presented as measured plant telemetry.

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

Generation analysis works best with a timestamp, output metric, and asset identifier. Capacity, expected output, efficiency, status, irradiation, temperature, wind, and humidity unlock additional KPIs.

Demand analysis recognizes columns such as `demand`, `load`, `consumption`, and `grid_import`. Maintenance analysis recognizes work-order IDs, asset IDs, event type, status, priority, repair or downtime hours, and cost.
