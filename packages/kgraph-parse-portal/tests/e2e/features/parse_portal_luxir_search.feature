@e2e @sdlc-graph @luxir @tika-grpc @buildbarn
Feature: RobOS Kgraph Parse Portal & Luxir Search Engine E2E Verification
  As an AI Lead System Architect and Autonomous Agent
  I want to crawl polyglot Linux directories, disambiguate MIME types into semantic SDLC graph nodes via Apache Tika gRPC,
  And verify that extracted contracts, microservices, and source artifacts are indexed and discoverable in the Luxir C++ Search Index

  Scenario: Ingest Linux Codebase, Disambiguate MIME Types, and Query Luxir C++ Hybrid Search Index
    Given the RobOS Kgraph Parse Portal is connected to Apache Tika 4.0 gRPC and Luxir Search Engine
    When the user scans the local codebase directory to extract semantic KGraph nodes
    Then the portal detects the directory archetype and displays extracted nodes
    And the Luxir search index counter updates to reflect the indexed nodes
    When the user tests the MIME disambiguation classifier with polyglot project files
    Then the classifier accurately identifies contracts, systemd services, and build systems
    When the user navigates to the Luxir Search Explorer tab
    And the user queries the Luxir search index for "Contract"
    Then matching OpenAPI and gRPC Protobuf contracts are displayed as search cards
    When the user filters by "Contracts (OpenAPI/gRPC)" facet
    Then only verified API contract artifacts are shown in the search results
    When the user navigates to the Hermetiq Buildbarn Helm tab
    And generates the distributed REAPI v2 Helm values configuration
    Then the OCI Helm values for "oci://ghcr.io/hermetiq/buildbarn" are rendered with CAS storage and replicas
