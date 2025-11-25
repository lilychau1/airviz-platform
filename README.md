# airviz-platform
An air quality visualisation platform for Greater London.

Link to project: https://airvizlondon.netlify.app/

## Introduction
This project is a proof-of-concept for a low-cost cloud visualisation platform for near-real-time environmental data, for resource-constrained organisations to develop and present to their target audience. 

This platform ingests hourly air quality data (different pollutant concentrations, air quality index and health recommendations) for each map tile within Greater London, and presents it to the public audience with interactive visualisations. 

## Goals
There are 4 objectives for the broader initiative: 
1)	Select visualisation tools and define design requirements: Explore existing data visualisation tools and define design requirements balancing between interactions (e.g.: filtering and drill-down) and usability (e.g., simplicity and accessibility). Choose a visualisation tool that provides the best trade-off for engaging users with varying levels of data literacy while maintaining low operational overhead.

2)	Understand and evaluate cloud infrastructure and software engineering techniques for front-end and backend development of a lightweight web-based near-real-time visualisation application: Review theories and case studies of cloud providers and cloud features for interactive data visualisation platforms to deliver scalability, availability, easy integration and cost optimisation, while not compromising engineering best practices such as security and reproducibility. Identify key features such as storage, databases, security and scalability options offered by various cloud providers to inform the selection of the most suitable services for resource-constrained environments.

3) Develop a solution: Design an architecture for an interactive data visualisation platform for near-real-time environmental data, and develop a prototype adopting the architecture. It will address both technical (computational efficiency, scalability, cost) and tactical (interactivity, usability) requirements. 

4)	Assess cloud resource configurations: Perform benchmarking experiments to compare cloud configuration strategies. Evaluate them using predefined metrics such as cost, latency and failure rates to determine the optimal configuration for cost-effective operation without compromising performance.

## Architecture and Design

### Technology
Below is the tech stack of the platform: 
Users and clients 

| Component | Technology |
|-----------|------------|
|Frontend|Svelte + Vite, Chart.js, MapLibre GL |
|API|Amazon API Gateway |
|Data ingestion|Scheduled Lambda function |
|Data processing and caching|Event-driven lambda functions |
|Data storage|Timeseries: RDS, Files: S3 |
|Monitoring and logging|AWS cloudwatch |
 
### Architecture
#### Architecture diagram: 
![architecture_diagram_v7](https://github.com/user-attachments/assets/011f9857-9479-44bf-9bbc-2713d9c772f8)

#### Entity Relationship diagram: 
![er_diagram_v3](https://github.com/user-attachments/assets/ad885bc4-a589-4fcf-a1bf-ee4ff29b402d)

### User Interfaces
The platform has three major pages: 

#### Map landing page
The entry point to the platform where users get a high-level, interactive view of near-real-time air quality data across the mapped region of Greater London.
<img width="2115" height="1203" alt="image" src="https://github.com/user-attachments/assets/1ca58665-4f12-4606-b1ce-392883a95255" />


#### Map aggregation page
A view that provides aggregated air quality data and trends for a larger geographic area (e.g., city, borough, district) with the ability to compare regions.
<img width="2114" height="1209" alt="image" src="https://github.com/user-attachments/assets/5f5b58b1-0057-48eb-a992-d81d1da58625" />


#### Tile detail page
Granular, near-real-time and historical air quality information for a specific 500 × 500m tile (from the Google Air Quality API). 
<img width="2110" height="1207" alt="image" src="https://github.com/user-attachments/assets/7f904181-7a54-487b-8d90-22602fbe9254" />

