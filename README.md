# Xīnjià Yīlù 新架一路 – Formgenerator

## Generator direkt öffnen

**[Onlinegenerator starten](https://xinjia-yilu-formgenerator.densemalt.chatgpt.site)**

Die Onlinefassung läuft ohne Python-Installation auf Computer, Tablet und Smartphone. Der Generator ist öffentlich und ohne Anmeldung erreichbar. Positionen und Anmerkungen auswählen, PDF erstellen und herunterladen.

Anmerkungen und Sammlungen bleiben im jeweiligen Browser. Für den Wechsel auf ein anderes Gerät „Datei sichern“ und dort „Datei laden“ verwenden. Die Onlinefassung liegt unter `online/dist/`; sie erzeugt die PDFs auf dem Gerät. Die folgende Anleitung beschreibt die zusätzliche lokale Python-Fassung.

Lokaler Formgenerator der Healthlane Academy mit 621 Comicpositionen der Figur Happel lǎoshī. Positionen auswählen, Hinweise ergänzen und ein persönliches Tableau als PDF speichern.

## Start auf dem Mac

Voraussetzung: Python 3.10 oder neuer. Repository herunterladen oder klonen und `Form-Generator starten.command` doppelklicken. Beim ersten Start werden die Python-Abhängigkeiten in einer lokalen `.venv` installiert; dafür wird Internet benötigt. Danach laufen Auswahl, Anmerkungen und PDF-Ausgabe lokal.

Alternativ, auch unter Linux/Windows:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python start.py
```

Unter Windows die Umgebung mit `.venv\Scripts\activate` aktivieren. Der Starter öffnet die lokale Browseradresse und verwendet eine vorhandene Instanz dieses Projektordners oder einen freien Port zwischen 8765 und 8785.

## Bedienung

1. Nach Nummer, Bereich oder Name suchen oder eine Sequenz wählen.
2. Kästchen **neben den Bildnummern** ankreuzen. Das Öffnen eines Bildes allein wählt es noch nicht für die PDF aus.
3. Hinweise im Figureneditor auswählen, ergänzen oder als eigene Textbausteine anlegen.
4. Ausgabeart und Seitenaufteilung festlegen: vier Figuren, zwei mit viel Schreibraum oder sechs mit seitlichen Kästen.
5. **PDF erstellen**, dann **PDF herunterladen**. Die zusätzliche lokale Exportdatei liegt in `exports/`; ihr Speicherort lässt sich in der Vorschau anzeigen.

Bei leerer Auswahl erscheint ein konkreter Hinweis. Fehler, etwa ein zu voller Anmerkungskasten, bleiben sichtbar und werden nicht durch stilles Abschneiden des Textes verborgen.

## Aufbewahren

Die aktuelle Auswahl wird unter `nutzer/` gespeichert. Benannte Sammlungen sowie JSON-Sicherung und -Import stehen im Generator zur Verfügung. `Datei sichern` erstellt eine JSON-Sicherung; für eine PDF die eigene PDF-Schaltfläche verwenden.

Persönliche Anmerkungen, Sammlungen, Exporte, Serverlogs, Originalvideo und Fotovorlagen werden nicht mit Git versioniert. Dieses Repository enthält die zum Betrieb benötigten 621 Comicdarstellungen, Galerievorschauen, Referenzfigur, Logo, Namensdaten und Schriften.

## Darstellungs- und Fachhinweise

Die sichtbaren Nummern laufen von 1 bis 621. Interne historische IDs bleiben erhalten, damit Notizen bei derselben Figur bleiben. Tiefe Stellungen sind bei einheitlichem Körpermaßstab natürlicherweise niedriger. Im PDF erscheinen zwei Dāntián-Ellipsen ohne Richtungspfeile.

Die 83 Sequenznamen und einige gleitende Sequenzgrenzen sind fachlich überprüfbar. Bā-Mén- und Armphasen-Zuordnungen sind Unterrichtsvorschläge; sie belegen keinen aus Bildern messbaren inneren Qi-Fluss. Anatomisches Links und Rechts beziehen sich auf die Figur.

Die chinesische PDF-Schrift dieser veröffentlichten Fassung ist die frei verteilbare **LXGW WenKai** im Kai-Stil. Die auf dem ursprünglichen Mac verwendete Apple-Systemschrift wird nicht verteilt. Titeltext und Figuren bleiben erhalten.

## Entwicklung und Prüfung

`server.py` stellt die lokale Oberfläche bereit, `tableau_pdf.py` baut die PDFs, `web/` enthält die Oberfläche und `data/figures.json` die 621 Positionen. Nur Loopback-Zugriff; das ist eine lokale Anwendung und keine direkt über GitHub Pages laufende Website.

```sh
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
```

## Schriftlizenzen und Bildmaterial

Die mitgelieferten Schriften Lato, Cormorant Garamond und LXGW WenKai stehen unter der SIL Open Font License 1.1; vollständige Hinweise liegen in `LICENSES/fonts/`. Für den übrigen Code, die Comicfigur und das Healthlane-Logo ist in diesem Repository keine pauschale Open-Source-Lizenz festgelegt.


Die 621 Positionen verwenden durchgaengig die juengere, freigegebene Referenzfigur ohne Brille und dasselbe schwarze Schuhmodell mit cremefarbenen Streifen und flacher brauner Sohle. Der anatomische Koerpermassstab und bestehende Haltungs- und Fusskorrekturen bleiben erhalten. Die 4K-Referenz ist technisch hochskaliert; die einzelnen Generierungen werden nicht als native 4K bezeichnet.


<!-- korrekturen-20261104 -->
50 gezielte Bildkorrekturen vom 4. November 2026: einheitliche Schuhstreifen, Hand- und Fussstellung, Proportionen und weisser Hintergrund. Alle 621 Dantian-Anker erneut visuell geprueft. Nummern und interne IDs unveraendert. Lokale PDF-Funktion unterstuetzt optional show_dantian=False fuer eine Fassung ohne Ellipsen; Standard bleibt mit beiden Ellipsen ohne Pfeile.
