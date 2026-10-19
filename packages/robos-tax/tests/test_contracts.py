"""Synthetic records only. No filesystem persistence of household instances."""
import copy
import json
import subprocess
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = json.loads((ROOT / 'household.schema.json').read_text())
CATALOG = json.loads((ROOT / 'kgraph/package.jsonld').read_text())
VALIDATOR = Draft202012Validator(SCHEMA, format_checker=FormatChecker())


def record(kind, **fields):
    return dict(id='synthetic-record', kind=kind, householdId='synthetic-household', **fields)


def observation(**changes):
    value = record(
        'FieldObservation', documentId='synthetic-document',
        formFieldDefinitionId='urn:robos:tax:US:2025:W-2:box:1', taxYear=2025,
        jurisdiction='US', page=1, boundingBox=dict(x=0.1, y=0.2, width=0.3, height=0.1),
        rawText='Synthetic wages 123.45', proposedValue='123.45', valueType='money',
        confidence=0.75, parserVersion='synthetic-v1', sourceContentHash='a' * 64,
        critical=True, reviewStatus='unreviewed')
    value.update(changes)
    return value


class Contracts(unittest.TestCase):
    def test_schema_is_valid(self):
        Draft202012Validator.check_schema(SCHEMA)

    def test_household_requires_approved_cloud_provider(self):
        good = record('Household', displayName='Synthetic household', vaultId='synthetic-vault',
                      approvedCloudProviderId='synthetic-approved-provider')
        self.assertTrue(VALIDATOR.is_valid(good))
        del good['approvedCloudProviderId']
        self.assertFalse(VALIDATOR.is_valid(good))

    def test_member_requires_scope_and_user(self):
        good = record('Member', robosUserId='synthetic-user', role='adult')
        self.assertTrue(VALIDATOR.is_valid(good))
        for key in ('householdId', 'robosUserId'):
            bad = copy.deepcopy(good)
            del bad[key]
            self.assertFalse(VALIDATOR.is_valid(bad))

    def test_dependent_does_not_require_login(self):
        self.assertTrue(VALIDATOR.is_valid(record('Dependent', displayName='Synthetic child',
                                                birthDate='2020-01-01', relationship='foster-child')))

    def test_placement_has_dated_residency(self):
        good = record('Placement', dependentId='synthetic-dependent', residenceId='synthetic-home',
                      startDate='2025-01-01', endDate='2025-12-31', nights=180,
                      taxYear=2025, placementType='custody')
        self.assertTrue(VALIDATOR.is_valid(good))
        for changes in (dict(nights=-1), dict(nights=367), dict(startDate='2025-02-30')):
            self.assertFalse(VALIDATOR.is_valid(dict(good, **changes)))

    def test_money_requires_exact_decimal_and_tax_treatment(self):
        good = record('Transaction', accountId='synthetic-account', postedDate='2025-01-01',
                      money=dict(amount='123.45', currency='USD'), entryType='expense',
                      taxTreatment='unassessed')
        self.assertTrue(VALIDATOR.is_valid(good))
        for amount in (123.45, '1,234.56', '123.456', 'NaN'):
            bad = copy.deepcopy(good)
            bad['money']['amount'] = amount
            self.assertFalse(VALIDATOR.is_valid(bad))
        del good['taxTreatment']
        self.assertFalse(VALIDATOR.is_valid(good))

    def test_no_arbitrary_account_number_field(self):
        good = record('Account', ownerMemberIds=['synthetic-member'], accountType='credit-card',
                      displayName='Synthetic card', lastFour='0000')
        self.assertTrue(VALIDATOR.is_valid(good))
        self.assertFalse(VALIDATOR.is_valid(dict(good, fullCardNumber='synthetic-forbidden-field')))

    def test_unreviewed_extraction_is_permitted_but_not_autoapproved(self):
        self.assertTrue(VALIDATOR.is_valid(observation()))
        self.assertFalse(VALIDATOR.is_valid(observation(reviewStatus='approved')))
        self.assertTrue(VALIDATOR.is_valid(observation(reviewStatus='approved',
                                                      reviewedBy='synthetic-reviewer',
                                                      reviewedAt='2026-10-19T17:00:00Z')))

    def test_correction_requires_value_reviewer_and_time(self):
        fixed = observation(reviewStatus='corrected', correctedValue='123.46',
                            reviewedBy='synthetic-reviewer', reviewedAt='2026-10-19T17:00:00Z')
        self.assertTrue(VALIDATOR.is_valid(fixed))
        for key in ('correctedValue', 'reviewedBy', 'reviewedAt'):
            bad = copy.deepcopy(fixed)
            del bad[key]
            self.assertFalse(VALIDATOR.is_valid(bad))

    def test_observations_require_source_coordinates(self):
        for changes in (dict(page=0), dict(confidence=1.1),
                        dict(boundingBox=dict(x=2, y=0, width=0.1, height=0.1))):
            self.assertFalse(VALIDATOR.is_valid(observation(**changes)))
        bad = observation()
        del bad['sourceContentHash']
        self.assertFalse(VALIDATOR.is_valid(bad))

    def test_submission_outcome_requires_acknowledgment(self):
        good = record('FilingSubmission', returnId='synthetic-return', route='native-efile',
                      status='accepted', acknowledgmentDocumentId='synthetic-ack')
        self.assertTrue(VALIDATOR.is_valid(good))
        del good['acknowledgmentDocumentId']
        self.assertFalse(VALIDATOR.is_valid(good))

    def test_print_mail_cannot_claim_electronic_acceptance(self):
        self.assertFalse(VALIDATOR.is_valid(record('FilingSubmission', returnId='synthetic-return',
                                                 route='print-mail', status='accepted',
                                                 acknowledgmentDocumentId='synthetic-ack')))

    def test_public_catalog_ids_and_field_links(self):
        nodes = CATALOG['robos:nodes']
        ids = [node['@id'] for node in nodes]
        self.assertEqual(len(ids), len(set(ids)))
        forms = {n['@id']: n for n in nodes if n['@type'] == 'tax:TaxFormDefinition'}
        fields = [n for n in nodes if n['@type'] == 'tax:TaxFieldDefinition']
        self.assertTrue(forms)
        self.assertTrue(fields)
        for node in nodes:
            self.assertEqual(node['robos:package'], 'tax')
            self.assertIn('robos:refersFrom', node)
            self.assertNotIn('householdId', node)
            self.assertNotIn('tax:proposedValue', node)
        for field in fields:
            form = forms[field['tax:formDefinition']['@id']]
            self.assertEqual(field['tax:taxYear'], form['tax:taxYear'])
            self.assertEqual(field['tax:jurisdiction'], form['tax:jurisdiction'])
            self.assertTrue(field['tax:critical'])
            self.assertTrue(field['tax:reviewRequired'])
            self.assertTrue(field['robos:refersFrom'].startswith('https://www.irs.gov/'))
        for form in forms.values():
            self.assertEqual(form['tax:coverage'], 'partial')
            self.assertFalse(form['tax:filingSupported'])
            self.assertFalse(form['tax:calculationSupported'])
            self.assertFalse(form['tax:extractionSupported'])

    def test_catalog_passes_robos_structural_checks(self):
        script = """
const fs = require('node:fs');
const {validateDocument} = require('./packages/robos-graph/lib/graph-workspace');
const catalog = JSON.parse(fs.readFileSync('./packages/robos-tax/kgraph/package.jsonld', 'utf8'));
const result = validateDocument(catalog);
console.log(JSON.stringify({conforms: result.conforms, errors: result.errors}));
process.exitCode = result.conforms ? 0 : 1;
"""
        result = subprocess.run(['node', '-e', script], cwd=ROOT.parents[1],
                                capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
