import zipfile
import xml.etree.ElementTree as ET

with zipfile.ZipFile("meta_official_template.xlsx") as z:
    wb_root = ET.fromstring(z.read("xl/workbook.xml"))
    sheets = wb_root.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheets")
    for s in sheets:
        print("Sheet:", s.attrib)

    shared_strings = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si"):
            t = si.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
            if t is not None and t.text:
                shared_strings.append(t.text)
            else:
                r_texts = []
                for r in si.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}r"):
                    rt = r.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
                    if rt is not None and rt.text:
                        r_texts.append(rt.text)
                shared_strings.append("".join(r_texts))

    for sheet_idx in [1, 2, 3]:
        name = f"xl/worksheets/sheet{sheet_idx}.xml"
        if name in z.namelist():
            print(f"\n=== ROWS IN SHEET {sheet_idx} ===")
            s_root = ET.fromstring(z.read(name))
            sheet_data = s_root.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheetData")
            for row in sheet_data.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row")[:5]:
                row_vals = []
                for c in row.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c"):
                    t_attr = c.attrib.get("t")
                    v = c.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v")
                    val = v.text if v is not None else ""
                    if t_attr == "s" and val != "":
                        val = shared_strings[int(val)]
                    row_vals.append(val)
                r_num = row.attrib.get("r")
                print(f"Row {r_num}: {row_vals[:12]}")