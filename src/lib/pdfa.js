export async function convertToPdfA(bytes, { conformance = '1b' } = {}) {
  const { PDFDocument, PDFName, PDFString } = await import('pdf-lib')
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })

  const isPart2 = String(conformance).toLowerCase().includes('2')
  const part = isPart2 ? '2' : '1'
  const conf = 'B'
  const nowIso = new Date().toISOString()

  // 1. PDF/A XMP Metadata Stream
  const xmp = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>${part}</pdfaid:part>
      <pdfaid:conformance>${conf}</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:format>application/pdf</dc:format>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
      <pdf:Producer>EditPDF PDF/A Archival Converter</pdf:Producer>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <xmp:CreateDate>${nowIso}</xmp:CreateDate>
      <xmp:ModifyDate>${nowIso}</xmp:ModifyDate>
      <xmp:MetadataDate>${nowIso}</xmp:MetadataDate>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`

  const metaStream = doc.context.flateStream(xmp)
  metaStream.dict.set(PDFName.of('Type'), PDFName.of('Metadata'))
  metaStream.dict.set(PDFName.of('Subtype'), PDFName.of('XML'))
  const metaRef = doc.context.register(metaStream)
  doc.catalog.set(PDFName.of('Metadata'), metaRef)

  // 2. OutputIntent for Color Management (sRGB IEC61966-2.1)
  const outputIntent = doc.context.obj({
    Type: PDFName.of('OutputIntent'),
    S: PDFName.of(isPart2 ? 'GTS_PDFA2' : 'GTS_PDFA1'),
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    RegistryName: PDFString.of('http://www.color.org'),
    Info: PDFString.of('sRGB IEC61966-2.1')
  })
  doc.catalog.set(PDFName.of('OutputIntents'), doc.context.obj([outputIntent]))

  // 3. Remove non-conforming features (scripts, disallowed actions)
  doc.catalog.delete(PDFName.of('Names'))
  doc.catalog.delete(PDFName.of('OpenAction'))
  doc.catalog.delete(PDFName.of('AA'))

  // 4. Save without object streams (required for PDF/A-1)
  const outBytes = await doc.save({ useObjectStreams: false })
  return new Blob([outBytes], { type: 'application/pdf' })
}
