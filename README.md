# airviz-platform
An air quality visualisation platform for Greater London

## Introduction
This project is a proof-of-concept for a low-cost cloud visualisation platform for near-real-time sensor data, for resource-constrained organisations to develop and present to their target audience. 

This platform ingests hourly air quality data (different pollutant concentrations, air quality index and health recommendations) for each map tile within Greater London, and presents it to the public audience with interactive visualisations. It also consists of an admin monitoring dashboard for developers to observe operational metrics, such as response latency and costs. 

## Goals
There are 4 objectives for the broader initiative: 
1. Understand and evaluate cloud infrastructure and software engineering techniques
- Review theories and case studies of cloud providers and cloud features for interactive data visualisation platforms to deliver scalability, availability, easy integration and cost optimisation, while not compromising engineering best practices such as security and reproducibility. 
- Identify key features such as storage, databases, security and scalability options offered by various cloud providers to inform the selection of the most suitable services for resource-constrained environments.  

2. Select visualisation tools and define design requirements: 
- Explore existing data visualisation tools and define the design requirements based on the balance between expressivity (e.g., filtering, drill-down interactions) and usability (e.g., simplicity, accessibility). 
- Choose a visualisation tool that provides the best trade-off for engaging users with varying levels of data literacy while maintaining low operational overhead. 

3. Develop a solution
- Design and implement an interactive data visualisation platform for near-real-time environmental data. It should address both technical (computational efficiency, scalability, cost) and tactical (interactivity, customisability, shareability) requirements.  

4. Assess cloud resource configurations
- Perform benchmarking experiments to compare different cloud resource allocation strategies. 
- Evaluate them using predefined metrics such as cost, latency , stress tolerance, and failure rates to determine the optimal configuration(s) for cost-effective operation without compromising performance. 

## Architecture and Design

### Technology
Below is the tech stack of the platform: 
Users and clients 

| Component | Technology |
|-----------|------------|
|Frontend|React JS, Observable Framework|
|API|Amazon API Gateway|
|Authentication|AWS Cognito|
|Data ingestion|Scheduled Lambda function |
|Data processing and caching|Event-driven lambda functions and AWS Elasticache|
|Data storage|Timeseries: RDS, Web data: DynamoDB, Files and exports: S3|
|Admin dashboard|Grafana connected to Cloudwatch|
|Monitoring and logging|AWS cloudwatch (API: Cloudwatch API)|
 
### Architecture


### User Interfaces
The platform has five major pages: 

#### Map landing page
The entry point to the platform where users get a high-level, interactive view of near-real-time air quality data across the mapped region of Greater London.

#### Map aggregation page
A view that provides aggregated air quality data and trends for a larger geographic area (e.g., city, borough, district) with the ability to compare regions.

#### Tile detail page
Granular, near-real-time and historical air quality information for a specific 500 × 500m tile (from the Google Air Quality API). 

#### Admin login page
Secure gateway for platform administrators to access monitoring and management tools.

#### Admin monitoring dashboard page
Operational oversight of the air quality platform, data flow health, and AWS infrastructure metrics in real-time. 

