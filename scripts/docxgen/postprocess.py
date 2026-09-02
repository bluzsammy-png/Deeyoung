import re
import shutil
import zipfile

SRC = "/home/z/my-project/download/QuantEdge_Pro_Production_Audit_Phase0.docx"
TMP = SRC + ".tmp"


def main():
    zin = zipfile.ZipFile(SRC, "r")
    zout = zipfile.ZipFile(TMP, "w", zipfile.ZIP_DEFLATED)
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == "word/document.xml":
            xml = data.decode("utf-8")
            n1 = len(re.findall(r"<w:pgNumType/>", xml))
            xml = re.sub(r"<w:pgNumType/>", "", xml)
            print(f"document.xml: removed {n1} empty pgNumType")
            data = xml.encode("utf-8")
        elif re.match(r"word/footer\d+\.xml", item.filename):
            xml = data.decode("utf-8")
            if "PAGE" in xml:
                patched = re.sub(
                    r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
                    r"\1 PAGE \\* arabic \\* MERGEFORMAT \2",
                    xml,
                )
                if patched != xml:
                    print(f"{item.filename}: patched PAGE field with arabic switch")
                xml = patched
            data = xml.encode("utf-8")
        zout.writestr(item, data)
    zin.close()
    zout.close()
    shutil.move(TMP, SRC)
    print("post-process complete")


if __name__ == "__main__":
    main()
