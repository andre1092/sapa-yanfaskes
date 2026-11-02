"""Synthetic observed-input validation tests; no browser, network, or real data."""
import copy
from datetime import datetime
import math
import unittest

from automation.aan_snapshot import HEADERS, sheet_rows


def fixture(source='Mobile JKN'):
    codes = [f'{number:08d}' for number in range(1, 26)]
    return {
        'timestamp': '2026-10-27 05:30:00', 'period': '2026-10',
        'source': source, 'kepwil': 7, 'cabang_code': 1310,
        'cabang_name': 'JEMBER (1310)', 'expected_kdppk': codes,
        'rows': [{'kdppk': code, 'faskes': f'RS Sintetis {number} ({code})',
                  'antrean': 10, 'peserta_jkn': 40, 'sep_rjtl': 80,
                  'capaian': .25 if source == 'Mobile JKN' else .125}
                 for number, code in enumerate(codes, 1)],
    }


class AanSnapshotTests(unittest.TestCase):
    def reject(self, mutate):
        data = fixture()
        mutate(data)
        with self.assertRaises(ValueError):
            sheet_rows(data)

    def test_exact_25_independent_codes_map_13_columns_preserving_text_and_order(self):
        observed = fixture()
        before = copy.deepcopy(observed)
        observed['rows'].reverse()
        mapped = sheet_rows(observed)
        self.assertEqual(len(mapped), 25)
        self.assertEqual(len(HEADERS), 13)
        self.assertTrue(all(len(row) == 13 for row in mapped))
        self.assertEqual({row[1] for row in mapped}, set(before['expected_kdppk']))
        self.assertEqual(mapped[0][1], '00000025')
        self.assertEqual(mapped[-1][1], '00000001')
        self.assertIsInstance(mapped[-1][1], str)
        self.assertEqual(mapped[0][3:], [7, 1310, 'JEMBER (1310)', 'JEMBER (1310)',
                                        7, .25, 10, 40, 80, 'Mobile JKN'])
        self.assertEqual(observed['rows'][-1], before['rows'][0])

    def test_timestamp_becomes_sheet_serial_with_fractional_day(self):
        data = fixture()
        serial = sheet_rows(data)[0][0]
        expected = (datetime(2026, 10, 27, 5, 30) - datetime(1899, 12, 30)).total_seconds() / 86400
        self.assertAlmostEqual(serial, expected, places=10)
        self.assertAlmostEqual(serial % 1, 5.5 / 24, places=9)
        self.assertTrue(math.isfinite(serial))

    def test_both_sources_preserve_25_text_codes_and_all_13_columns(self):
        for source, normalized, ratio in (('Mobile JKN', 'Mobile JKN', .25),
                                           ('Semua Sumber', 'All Sumber', .125),
                                           ('All Sumber', 'All Sumber', .125)):
            with self.subTest(source=source):
                data = fixture(source)
                before = copy.deepcopy(data)
                mapped = sheet_rows(data)
                self.assertEqual(len(mapped), 25)
                for observed, row in zip(data['rows'], mapped):
                    self.assertEqual(len(row), 13)
                    self.assertEqual(row[1:3], [observed['kdppk'], observed['faskes']])
                    self.assertIsInstance(row[1], str)
                    self.assertEqual(row[8:], [ratio, 10, 40, 80, normalized])
                self.assertEqual(data, before)

    def test_source_selects_its_own_denominator(self):
        for source, wrong_ratio in (('Mobile JKN', .125),
                                     ('Semua Sumber', .25), ('All Sumber', .25)):
            with self.subTest(source=source):
                data = fixture(source)
                data['rows'][0]['capaian'] = wrong_ratio
                with self.assertRaises(ValueError):
                    sheet_rows(data)

    def test_ratios_above_one_are_accepted_when_counts_justify_them(self):
        for source, ratio in (('Mobile JKN', 3), ('Semua Sumber', 1.5),
                                ('All Sumber', 1.5)):
            with self.subTest(source=source):
                data = fixture(source)
                data['rows'][0].update(antrean=120, capaian=ratio)
                self.assertEqual(sheet_rows(data)[0][8], ratio)

    def test_zero_denominator_is_selected_by_source(self):
        for source, denominator, other in (('Mobile JKN', 'peserta_jkn', 'sep_rjtl'),
                                             ('Semua Sumber', 'sep_rjtl', 'peserta_jkn'),
                                             ('All Sumber', 'sep_rjtl', 'peserta_jkn')):
            with self.subTest(source=source):
                data = fixture(source)
                data['rows'][0].update({denominator: 0, other: 80, 'antrean': 0, 'capaian': 0})
                self.assertEqual(sheet_rows(data)[0][8:10], [0, 0])
                for values in ({'antrean': 1}, {'capaian': .1}):
                    invalid = copy.deepcopy(data)
                    invalid['rows'][0].update(values)
                    with self.assertRaises(ValueError):
                        sheet_rows(invalid)
                data['rows'][0].update({denominator: 40, other: 0, 'antrean': 10, 'capaian': .25})
                self.assertEqual(sheet_rows(data)[0][8], .25)

    def test_independent_code_set_cannot_be_replaced_by_export_codes(self):
        self.reject(lambda data: data['expected_kdppk'].__setitem__(0, '99999999'))
        self.reject(lambda data: data['rows'][0].update(kdppk='99999999', faskes='Unknown (99999999)'))
        self.reject(lambda data: data['rows'][1].update(data['rows'][0]))
        self.reject(lambda data: data['rows'].pop())
        self.reject(lambda data: data['rows'].append(copy.deepcopy(data['rows'][0])))
        self.reject(lambda data: data['rows'][0].pop('kdppk'))

    def test_expected_codes_require_25_unique_eight_character_strings(self):
        for codes in (None, [], ['00000001'] * 25, list(range(25)), ['bad'] * 25):
            with self.subTest(codes=str(codes)[:40]):
                self.reject(lambda data: data.update(expected_kdppk=codes))
        self.reject(lambda data: data['expected_kdppk'].pop())

    def test_counts_cannot_be_missing_boolean_negative_or_fractional(self):
        for key in ('antrean', 'peserta_jkn', 'sep_rjtl'):
            self.reject(lambda data: data['rows'][0].pop(key))
            for invalid in (True, False, -1, 1.5, '10', None):
                with self.subTest(key=key, invalid=invalid):
                    self.reject(lambda data: data['rows'][0].update({key: invalid}))

    def test_percentage_must_be_finite_fraction_consistent_with_counts(self):
        for ratio in (float('nan'), float('inf'), -float('inf'), -.1, True, '25%', None, 25, .3):
            with self.subTest(ratio=ratio):
                self.reject(lambda data: data['rows'][0].update(capaian=ratio))
        self.reject(lambda data: data['rows'][0].pop('capaian'))
        data = fixture()
        data['rows'][0].update(antrean=1, peserta_jkn=3, capaian=.3333)
        self.assertEqual(sheet_rows(data)[0][8], .3333)
        data['rows'][0]['capaian'] = .3334
        with self.assertRaises(ValueError):
            sheet_rows(data)

    def test_zero_denominator_requires_explicit_zero_numerator_and_ratio(self):
        data = fixture()
        data['rows'][0].update(antrean=0, peserta_jkn=0, capaian=0)
        self.assertEqual(sheet_rows(data)[0][8:11], [0, 0, 0])
        for values in ({'antrean': 1, 'capaian': 0}, {'antrean': 0, 'capaian': .1}):
            invalid = copy.deepcopy(data)
            invalid['rows'][0].update(values)
            with self.assertRaises(ValueError):
                sheet_rows(invalid)

    def test_wrong_period_source_scope_and_name_rejected(self):
        for key, value in (('period', '2026-09'), ('source', 'Onsite'),
                           ('source', ['Mobile JKN', 'Onsite']), ('kepwil', 8),
                           ('cabang_code', 1311), ('cabang_name', 'OTHER (1310)')):
            with self.subTest(key=key, value=value):
                self.reject(lambda data: data.update({key: value}))
        for value in ('', 'RS wrong (99999999)', None, 42):
            self.reject(lambda data: data['rows'][0].update(faskes=value))

    def test_malformed_top_level_rows_and_timestamp_rejected(self):
        for data in (None, [], 'snapshot', 42, {}):
            with self.subTest(data=data), self.assertRaises(ValueError):
                sheet_rows(data)
        for value in (None, '', '2026-10-27', '2026-02-30 05:30:00', '2026-10-27T05:30:00', 123):
            self.reject(lambda data: data.update(timestamp=value))
        self.reject(lambda data: data.update(rows=None))
        self.reject(lambda data: data['rows'].__setitem__(0, None))


if __name__ == '__main__':
    unittest.main()
