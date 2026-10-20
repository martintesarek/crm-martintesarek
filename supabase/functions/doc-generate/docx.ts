// Sazba dokumentu do hlavičkového papíru Martin Tesárek (port skriptu build_doc.py).
// Vstup: { title, subtitle?, blocks[] } – stejný formát bloků jako skill realitni-dokumenty.
import { unzipSync, zipSync, strFromU8, strToU8 } from 'npm:fflate@0.8.2'

export type Block =
  | { type: 'title'; text: string; subtitle?: string; upper?: boolean }
  | { type: 'heading'; text: string; subtext?: string; style?: 'section'; align?: Align; before?: number }
  | { type: 'paragraph' | 'p'; text: string; align?: Align; before?: number; after?: number; bold?: boolean; navy?: boolean; indent_cm?: number }
  | { type: 'list'; items: string[]; style?: 'number' | 'bullet' | 'letter'; prefix?: string; start?: number; indent_cm?: number; after?: number; align?: Align }
  | { type: 'party'; fields: [string, string][]; note?: string; label?: string; before?: number; after?: number }
  | { type: 'fields'; items: [string, string][]; bold_labels?: boolean; before?: number; after?: number; indent_cm?: number }
  | { type: 'separator'; text?: string; bold?: boolean; align?: Align; before?: number; after?: number }
  | { type: 'table'; header?: string[]; rows: string[][]; widths_cm?: number[]; align?: Align[]; total?: string[] }
  | { type: 'note'; title?: string; text: string }
  | { type: 'attachments'; items: string[]; before?: number }
  | { type: 'signatures'; place_date_text?: string; place_date?: boolean; signers: { role: string; name?: string }[]; per_row?: number; before?: number }
  | { type: 'spacer'; pt?: number }
  | { type: 'pagebreak' }
export type Align = 'left' | 'center' | 'right' | 'justify'
export type Spec = { title: string; subtitle?: string; upper?: boolean; blocks: Block[] }

const FONT = 'Montserrat', NAVY = '253371', BLACK = '000000', WHITE = 'FFFFFF', LINE_HEX = 'BFC3D6', LIGHT_HEX = 'EEF0F6'
const BODY = 9, TITLE = 20, SUBTITLE = 8, PARA_AFTER = 10, NUM_INDENT = 0.635, BULLET_LEFT = 2.54, BULLET_HANG = 0.635, CONTENT_W = 15.9
const DOTS = '…………………………'
const JC: Record<Align, string> = { left: 'left', center: 'center', right: 'right', justify: 'both' }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const cm = (v: number) => Math.round(v * 567)
const pt = (v: number) => Math.round(v * 20)

type RunOpt = { size?: number; bold?: boolean; color?: string; hl?: boolean }
function run(text: string, o: RunOpt = {}) {
  const size = (o.size ?? BODY) * 2
  return `<w:r><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT}"/>${o.bold ? '<w:b/><w:bCs/>' : ''}<w:color w:val="${o.color ?? BLACK}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${o.hl ? '<w:highlight w:val="yellow"/>' : ''}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
}
const BR = '<w:r><w:br/></w:r>'
const TAB = '<w:r><w:tab/></w:r>'

// **tučně** a [[DOPLNIT: …]] (žlutě); \n = zalomení řádku
const TOKEN = /(\*\*.+?\*\*|\[\[.+?\]\])/g
export function rich(text: string, o: RunOpt = {}): string {
  const lines = String(text ?? '').split('\n')
  let out = ''
  lines.forEach((line, li) => {
    if (li) out += BR
    for (const part of line.split(TOKEN)) {
      if (!part) continue
      if (part.startsWith('**') && part.endsWith('**')) out += rich(part.slice(2, -2), { ...o, bold: true })
      else if (part.startsWith('[[') && part.endsWith(']]')) out += rich('[' + part.slice(2, -2) + ']', { ...o, hl: true })
      else out += run(part, o)
    }
  })
  return out
}

type POpt = { before?: number; after?: number; align?: Align; left?: number; hanging?: number; keepNext?: boolean; exactLine?: boolean }
function para(content: string, o: POpt = {}) {
  const ind = o.left != null ? `<w:ind w:left="${cm(o.left)}"${o.hanging ? ` w:hanging="${cm(o.hanging)}"` : ''}/>` : ''
  const tabs = o.hanging && o.left != null ? `<w:tabs><w:tab w:val="left" w:pos="${cm(o.left)}"/></w:tabs>` : ''
  const spacing = o.exactLine ? `<w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>` : `<w:spacing w:before="${pt(o.before ?? 0)}" w:after="${pt(o.after ?? PARA_AFTER)}" w:line="240" w:lineRule="auto"/>`
  return `<w:p><w:pPr>${o.keepNext ? '<w:keepNext/>' : ''}${tabs}${spacing}${ind}<w:jc w:val="${JC[o.align ?? 'justify']}"/></w:pPr>${content}</w:p>`
}

function tableXml(cells: string[][], widths: number[], o: { borders: boolean; header?: boolean; shade?: (r: number, c: number) => string | null; margins?: [number, number, number, number]; center?: boolean }) {
  const [mt, mb, ml, mr] = o.margins ?? [50, 50, 90, 90]
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((e) => o.borders ? `<w:${e} w:val="single" w:sz="4" w:space="0" w:color="${LINE_HEX}"/>` : `<w:${e} w:val="nil"/>`).join('')
  const total = widths.reduce((a, b) => a + b, 0)
  let x = `<w:tbl><w:tblPr><w:tblW w:w="${cm(total)}" w:type="dxa"/>${o.center ? '<w:jc w:val="center"/>' : ''}<w:tblLayout w:type="fixed"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:top w:w="${mt}" w:type="dxa"/><w:left w:w="${ml}" w:type="dxa"/><w:bottom w:w="${mb}" w:type="dxa"/><w:right w:w="${mr}" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${cm(w)}"/>`).join('')}</w:tblGrid>`
  cells.forEach((row, ri) => {
    x += `<w:tr>${o.header && ri === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}`
    row.forEach((c, ci) => {
      const fill = o.shade?.(ri, ci)
      x += `<w:tc><w:tcPr><w:tcW w:w="${cm(widths[ci])}" w:type="dxa"/>${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}</w:tcPr>${c}</w:tc>`
    })
    x += '</w:tr>'
  })
  return x + '</w:tbl>'
}

const dots = (v: string | null | undefined) => (v == null || v === '' ? DOTS : v)

function render(b: Block): string {
  switch (b.type) {
    case 'title': {
      let x = para(rich(b.upper === false ? b.text : b.text.toUpperCase(), { size: TITLE, bold: true, color: NAVY }), { after: b.subtitle ? 0 : 24, align: 'center' })
      if (b.subtitle) x += para(rich(b.subtitle.toUpperCase(), { size: SUBTITLE, bold: true, color: NAVY }), { after: 24, align: 'center' })
      return x
    }
    case 'heading': {
      const align: Align = b.style === 'section' ? 'left' : b.align ?? 'center'
      return para(rich(b.text + (b.subtext ? '\n' + b.subtext : ''), { bold: true, color: NAVY }), { before: b.before ?? 14, after: 6, align, keepNext: true })
    }
    case 'paragraph': case 'p':
      return para(rich(b.text, { bold: !!b.bold, color: b.navy ? NAVY : BLACK }), { before: b.before ?? 0, after: b.after ?? PARA_AFTER, align: b.align ?? 'justify', left: b.indent_cm })
    case 'list': {
      const style = b.style ?? 'number', start = b.start ?? 1
      return b.items.map((item, i) => {
        const n = start + i
        let mark: string, left: number, hang: number
        if (style === 'bullet') { mark = '•'; left = b.indent_cm ?? BULLET_LEFT; hang = BULLET_HANG }
        else if (style === 'letter') { mark = String.fromCharCode(96 + n) + ')'; left = b.indent_cm ?? 1.27; hang = NUM_INDENT }
        else { mark = b.prefix ? `${b.prefix}${n}` : `${n}.`; left = b.indent_cm ?? (b.prefix ? 0.9 : NUM_INDENT); hang = left }
        const last = i === b.items.length - 1
        const after = b.after ?? (style === 'number' || last ? PARA_AFTER : 2)
        return para(run(mark) + TAB + rich(item), { after, align: b.align ?? 'justify', left, hanging: hang })
      }).join('')
    }
    case 'party': {
      let c = b.label ? rich(`**${b.label}**\n`) : ''
      b.fields.forEach(([label, value], i) => {
        if (i) c += BR
        const lab = label.endsWith(':') ? label : label + ':'
        c += rich(i === 0 ? `**${lab}**` : lab) + rich(' ' + dots(value), { bold: i === 0 })
      })
      if (b.note) c += BR + rich(b.note)
      return para(c, { before: b.before ?? 0, after: b.after ?? PARA_AFTER, align: 'left' })
    }
    case 'fields': {
      let c = ''
      b.items.forEach(([label, value], i) => {
        if (i) c += BR
        const lab = label.endsWith(':') ? label : label + ':'
        c += rich(b.bold_labels === false ? lab : `**${lab}**`) + rich(' ' + dots(value))
      })
      return para(c, { before: b.before ?? 0, after: b.after ?? PARA_AFTER, align: 'left', left: b.indent_cm })
    }
    case 'separator':
      return para(rich(b.text ?? 'a', { bold: b.bold ?? true }), { before: b.before ?? 6, after: b.after ?? PARA_AFTER, align: b.align ?? 'left' })
    case 'table': {
      const ncols = (b.header ?? b.rows[0]).length
      const widths = b.widths_cm ?? Array(ncols).fill(CONTENT_W / ncols)
      const aligns = b.align ?? Array(ncols).fill('left')
      const cell = (t: string, bold: boolean, color: string, al: Align) => para(rich(t, { bold, color }), { before: 0, after: 0, align: al })
      const rows: string[][] = []
      if (b.header) rows.push(b.header.map((h, i) => cell(h, true, WHITE, aligns[i])))
      b.rows.forEach((r) => rows.push(r.map((v, i) => cell(v, false, BLACK, aligns[i]))))
      if (b.total) rows.push(b.total.map((v, i) => cell(v, true, NAVY, aligns[i])))
      return tableXml(rows, widths, { borders: true, header: !!b.header, center: true, shade: (r) => (b.header && r === 0 ? NAVY : b.total && r === rows.length - 1 ? LIGHT_HEX : null) }) + para('', { after: 4 })
    }
    case 'note': {
      const c = para((b.title ? rich(`**${b.title}**\n`, { color: NAVY }) : '') + rich(b.text), { before: 0, after: 0, align: 'left' })
      return tableXml([[c]], [CONTENT_W], { borders: false, margins: [110, 110, 160, 160], shade: () => LIGHT_HEX }) + para('', { after: 4 })
    }
    case 'attachments': {
      let c = ''
      b.items.forEach((item, i) => { if (i) c += BR; c += rich(`Příloha ${i + 1}:`, { bold: true, color: NAVY }) + rich(' ' + item) })
      return para(c, { before: b.before ?? 14, after: PARA_AFTER, align: 'left' })
    }
    case 'signatures': {
      let x = ''
      if (b.place_date !== false) x += para(rich(b.place_date_text ?? 'V ………………… dne …………………'), { before: b.before ?? 14, after: 36, align: 'left' })
      const perRow = b.per_row ?? (b.signers.length > 1 ? 2 : 1)
      for (let gi = 0; gi < b.signers.length; gi += perRow) {
        const grp = b.signers.slice(gi, gi + perRow)
        const cells: string[] = []
        for (let i = 0; i < perRow; i++) {
          const s = grp[i]
          const al: Align = perRow === 2 && i === 1 ? 'right' : 'left'
          cells.push(s ? para(rich('……………………………………\n' + `**${s.role}**` + (s.name ? `\n${s.name}` : '')), { before: 0, after: 0, align: al }) : para('', { before: 0, after: 0 }))
        }
        x += tableXml([cells], Array(perRow).fill(CONTENT_W / perRow), { borders: false, margins: [0, 0, 0, 0] }) + para('', { after: 30 })
      }
      return x
    }
    case 'spacer': return para('', { after: b.pt ?? 10 })
    case 'pagebreak': return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`
  }
  throw new Error('Neznámý typ bloku: ' + (b as { type: string }).type)
}

export function buildDocx(spec: Spec, template: Uint8Array): Uint8Array {
  const zip = unzipSync(template)
  const doc = strFromU8(zip['word/document.xml'])
  const bodyStart = doc.indexOf('<w:body>') + '<w:body>'.length
  const sect = doc.indexOf('<w:sectPr')
  const blocks: Block[] = [{ type: 'title', text: spec.title, subtitle: spec.subtitle, upper: spec.upper }, ...spec.blocks]
  let body = blocks.map(render).join('')
  // poslední odstavec co nejmenší, aby nezaložil prázdnou stránku
  body += para('', { exactLine: true })
  zip['word/document.xml'] = strToU8(doc.slice(0, bodyStart) + body + doc.slice(sect))
  // výchozí písmo Montserrat 9 pt
  const styles = strFromU8(zip['word/styles.xml'])
    .replace(/<w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"\/>/, `<w:rFonts w:ascii="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT}" w:hAnsi="${FONT}"/>`)
    .replace(/<w:sz w:val="22"\/><w:szCs w:val="22"\/>/, '<w:sz w:val="18"/><w:szCs w:val="18"/>')
  zip['word/styles.xml'] = strToU8(styles)
  // řádek ukončený ručním zalomením se v bloku neroztahuje
  const settings = strFromU8(zip['word/settings.xml'])
  if (!settings.includes('doNotExpandShiftReturn')) zip['word/settings.xml'] = strToU8(settings.replace('<w:compat>', '<w:compat><w:doNotExpandShiftReturn/>'))
  // metadata
  const core = zip['docProps/core.xml']
  if (core) zip['docProps/core.xml'] = strToU8(strFromU8(core).replace(/<dc:title>.*?<\/dc:title>/, `<dc:title>${esc(spec.title)}</dc:title>`))
  return zipSync(zip, { level: 6 })
}
