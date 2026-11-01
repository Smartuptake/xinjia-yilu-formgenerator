"""Integrationstests mit ausschließlich temporären Nutzerdaten und Exporten."""
import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.parse import quote

import pymupdf as fitz
import server


class GeneratorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.original = server.USER, server.COLLECTIONS, server.EXPORTS
        server.USER = Path(cls.temp.name) / 'nutzer'
        server.COLLECTIONS = server.USER / 'sammlungen'
        server.COLLECTIONS.mkdir(parents=True)
        server.EXPORTS = Path(cls.temp.name) / 'exports'
        server.EXPORTS.mkdir()
        # Der Dateiserver löst /exports relativ zu ROOT auf. Nur für diese Route
        # wird der temporäre Exportordner als Wurzel verwendet.
        class TestHandler(server.Handler):
            def log_message(self, *args):
                pass
            def do_GET(self):
                if self.path.startswith('/exports/'):
                    old = server.ROOT
                    try:
                        server.ROOT = Path(cls.temp.name)
                        super().do_GET()
                    finally:
                        server.ROOT = old
                else:
                    super().do_GET()
        cls.app = server.ThreadingHTTPServer(('127.0.0.1', 0), TestHandler)
        cls.thread = threading.Thread(target=cls.app.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.app.shutdown()
        cls.app.server_close()
        cls.thread.join()
        server.USER, server.COLLECTIONS, server.EXPORTS = cls.original
        cls.temp.cleanup()

    def request(self, method, route, value=None, origin=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.app.server_port)
        headers = {'Content-Type': 'application/json'}
        if origin:
            headers['Origin'] = origin
        connection.request(method, quote(route, safe='/?=&%'),
                           None if value is None else json.dumps(value).encode(), headers)
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_621_positions_and_assets(self):
        rows = server.ROWS
        self.assertEqual(len(rows), 621)
        self.assertEqual(len({r['id'] for r in rows}), 621)
        self.assertEqual([r['number'] for r in rows], list(range(1, 622)))
        for row in rows:
            for relative in (row['image']['path'], row['image'].get('pdf_path'), row['thumbnail']):
                if relative:
                    self.assertTrue((server.ROOT / relative).is_file(), relative)

    def test_pdf_modes_and_download(self):
        ids = [server.ROWS[-1]['id'], server.ROWS[0]['id']]
        state = {'selected': ids, 'notes': {ids[1]: {'text': 'Prüfhinweis Fußstellung'}},
                 'title': 'Prüfung Tàijíquán', 'layout': 'below'}
        for mode, layout in [('custom', 'below'), ('plain', 'side'), ('annotated', 'spacious')]:
            with self.subTest(mode=mode):
                status, _, body = self.request('POST', '/api/export', dict(state, mode=mode, layout=layout))
                self.assertEqual(status, 200, body)
                result = json.loads(body)
                self.assertEqual(result['figures'], 2)
                status, preview_headers, preview = self.request('GET', result['url'])
                self.assertEqual(status, 200)
                status, headers, download = self.request('GET', result['download_url'])
                self.assertEqual(status, 200)
                self.assertEqual(download, preview)
                self.assertIn("filename*=UTF-8''Pr%C3%BCfung", headers['Content-Disposition'])
                self.assertNotIn('Content-Disposition', preview_headers)
                with fitz.open(stream=download, filetype='pdf') as document:
                    self.assertEqual(len(document), 1)
                    text = ''.join(page.get_text() for page in document)
                    self.assertIn('Prüfung Tàijíquán', text)
                    self.assertIn('621', text)
                    if mode == 'custom':
                        self.assertIn('Prüfhinweis Fußstellung', text)
                    elif mode == 'plain':
                        self.assertNotIn('Prüfhinweis Fußstellung', text)

    def test_empty_selection_and_origin(self):
        status, _, body = self.request('POST', '/api/export', {'selected': []})
        self.assertEqual(status, 400)
        self.assertIn('mindestens eine Position', json.loads(body)['error'])
        status, _, _ = self.request('POST', '/api/state', {}, origin='https://example.org')
        self.assertEqual(status, 403)

    def test_default_chinese_title(self):
        status, _, body = self.request('POST', '/api/export', {'selected': [server.ROWS[0]['id']]})
        self.assertEqual(status, 200, body)
        _, _, data = self.request('GET', json.loads(body)['url'])
        with fitz.open(stream=data, filetype='pdf') as document:
            text = document[0].get_text()
            self.assertIn('新架一路', text)
            self.assertIn('陈氏太极拳', text)
            self.assertIn('Chen Stil Tàijíquán', text)

    def test_state_round_trip(self):
        state = {'selected': [server.ROWS[4]['id']], 'title': 'Lokale Sammlung',
                 'notes': {server.ROWS[4]['id']: {'text': 'Füße parallel'}}}
        status, _, _ = self.request('POST', '/api/state', state)
        self.assertEqual(status, 200)
        status, _, body = self.request('GET', '/api/data')
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertEqual(result['state'], server.clean_state(state))
        self.assertEqual(result['count'], 621)


if __name__ == '__main__':
    unittest.main()
