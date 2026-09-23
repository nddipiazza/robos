@e2e @seo @crawlers
Feature: Search engines and AI agents can discover the site
  Public pages are crawlable by search engines, AI search and AI agents; private pages are not.
  Every page carries canonical metadata and schema.org structured data.

  Scenario: robots.txt, sitemap, llms.txt and structured data are served
    Then robots.txt welcomes search engines and AI agents but blocks private paths
    And the sitemap lists the home page
    And llms.txt describes the site for AI agents
    And the home page has canonical, Open Graph and schema.org metadata
    And private pages are marked noindex
