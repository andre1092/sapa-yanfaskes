from docx import Document
import sys

doc = Document(sys.argv[1])
for p in doc.paragraphs:
    print(p.text)
