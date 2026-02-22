'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, ArrowLeft, ArrowRight, Check, AlertCircle, AlertTriangle, Loader2, FileText, X } from 'lucide-react'

// Types
interface ContactType {
  id: string
  name: string
}

interface MappedContact {
  name: string
  company: string
  type: string
  phone: string
  email: string
  notes: string
}

type Step = 1 | 2 | 3 | 4

type FieldKey = 'name' | 'company' | 'type' | 'phone' | 'email' | 'notes'

interface FieldDef {
  key: FieldKey
  label: string
  required: boolean
  aliases: string[]
}

const FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'display_name', 'full_name', 'contact_name', 'first_name'] },
  { key: 'company', label: 'Company', required: false, aliases: ['company', 'company_name', 'organization'] },
  { key: 'type', label: 'Type', required: false, aliases: ['type', 'contact_type', 'category'] },
  { key: 'phone', label: 'Phone', required: false, aliases: ['phone', 'phone_number', 'mobile', 'telephone', 'cell'] },
  { key: 'email', label: 'Email', required: false, aliases: ['email', 'email_address', 'e-mail'] },
  { key: 'notes', label: 'Notes', required: false, aliases: ['notes', 'note', 'comments', 'description'] },
]

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current.length > 0 || lines.length > 0) {
        lines.push(current)
        current = ''
      }
      if (ch === '\r' && text[i + 1] === '\n') i++
    } else {
      current += ch
    }
  }
  if (current.length > 0) lines.push(current)

  if (lines.length === 0) return { headers: [], rows: [] }

  function splitRow(line: string): string[] {
    const fields: string[] = []
    let field = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = !quoted
        }
      } else if (ch === ',' && !quoted) {
        fields.push(field.trim())
        field = ''
      } else {
        field += ch
      }
    }
    fields.push(field.trim())
    return fields
  }

  const headers = splitRow(lines[0])
  const rows = lines.slice(1).map(splitRow).filter((r) => r.some((cell) => cell.length > 0))

  return { headers, rows }
}

function autoDetectMapping(headers: string[]): Record<FieldKey, number> {
  const mapping: Record<FieldKey, number> = {
    name: -1,
    company: -1,
    type: -1,
    phone: -1,
    email: -1,
    notes: -1,
  }

  for (const field of FIELDS) {
    const idx = headers.findIndex((h) =>
      field.aliases.includes(h.toLowerCase().trim())
    )
    if (idx !== -1) {
      mapping[field.key] = idx
    }
  }

  return mapping
}

function validatePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 10
}

export default function ImportContactsPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>(1)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<FieldKey, number>>({
    name: -1, company: -1, type: -1, phone: -1, email: -1, notes: -1,
  })
  const [contactTypes, setContactTypes] = useState<ContactType[]>([])
  const [mappingError, setMappingError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [fileError, setFileError] = useState('')

  // Step 4 state
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{
    imported: number
    skipped: number
    skipped_contacts: { name: string; reason: string }[]
  } | null>(null)
  const [importError, setImportError] = useState('')

  // Fetch contact types on mount
  useEffect(() => {
    async function loadTypes() {
      try {
        const res = await fetch('/api/contact-types')
        const data = await res.json()
        if (data.types) setContactTypes(data.types)
      } catch (err) {
        console.error('Failed to load contact types:', err)
      }
    }
    loadTypes()
  }, [])

  // Build mapped contacts from rows + mapping
  function getMappedContacts(): MappedContact[] {
    return rows.map((row) => ({
      name: mapping.name >= 0 ? (row[mapping.name] || '') : '',
      company: mapping.company >= 0 ? (row[mapping.company] || '') : '',
      type: mapping.type >= 0 ? (row[mapping.type] || '') : '',
      phone: mapping.phone >= 0 ? (row[mapping.phone] || '') : '',
      email: mapping.email >= 0 ? (row[mapping.email] || '') : '',
      notes: mapping.notes >= 0 ? (row[mapping.notes] || '') : '',
    }))
  }

  function handleFile(file: File) {
    setFileError('')
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setFileError('Please select a CSV file.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError('File exceeds 5MB limit.')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const { headers: h, rows: r } = parseCSV(text)
      if (h.length === 0) {
        setFileError('Could not parse CSV. No headers found.')
        return
      }
      setHeaders(h)
      setRows(r)
      setFileName(file.name)
      setMapping(autoDetectMapping(h))
    }
    reader.readAsText(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function goToStep2() {
    setStep(2)
  }

  function goToStep3() {
    if (mapping.name < 0) {
      setMappingError('Name field mapping is required.')
      return
    }
    setMappingError('')
    setStep(3)
  }

  async function doImport() {
    setImporting(true)
    setImportError('')
    setStep(4)

    const contacts = getMappedContacts().filter((c) => c.name.trim())

    try {
      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts }),
      })

      if (!res.ok) {
        const err = await res.json()
        setImportError(err.error || 'Import failed')
        setImporting(false)
        return
      }

      const data = await res.json()
      setResult(data)
    } catch (err) {
      console.error('Import error:', err)
      setImportError('Network error. Please try again.')
    } finally {
      setImporting(false)
    }
  }

  function resetAll() {
    setStep(1)
    setFileName('')
    setHeaders([])
    setRows([])
    setMapping({ name: -1, company: -1, type: -1, phone: -1, email: -1, notes: -1 })
    setMappingError('')
    setFileError('')
    setResult(null)
    setImportError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Preview validation
  const mappedContacts = step >= 3 ? getMappedContacts() : []
  const validContacts = mappedContacts.filter((c) => c.name.trim())
  const invalidContacts = mappedContacts.filter((c) => !c.name.trim())
  const phoneWarnings = validContacts.filter((c) => c.phone.trim() && !validatePhone(c.phone))

  const steps = [
    { num: 1, label: 'Upload' },
    { num: 2, label: 'Map Columns' },
    { num: 3, label: 'Preview' },
    { num: 4, label: 'Import' },
  ]

  return (
    <div className="h-[calc(100vh-64px)] bg-white overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push('/dashboard/contacts')}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Import Contacts</h1>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center mb-8">
          {steps.map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                    step > s.num
                      ? 'bg-green-500 border-green-500 text-white'
                      : step === s.num
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-gray-300 text-gray-400'
                  }`}
                >
                  {step > s.num ? <Check className="w-4 h-4" /> : s.num}
                </div>
                <span className={`text-xs mt-1.5 font-medium ${
                  step >= s.num ? 'text-gray-700' : 'text-gray-400'
                }`}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`w-16 h-0.5 mx-2 mb-5 ${
                  step > s.num ? 'bg-green-500' : 'bg-gray-200'
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              <Upload className={`w-10 h-10 mx-auto mb-3 ${dragOver ? 'text-blue-500' : 'text-gray-400'}`} />
              <p className="text-sm font-medium text-gray-700">
                Drag and drop a CSV file here, or click to browse
              </p>
              <p className="text-xs text-gray-400 mt-1">Maximum file size: 5MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>

            {fileError && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {fileError}
              </div>
            )}

            {fileName && (
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <FileText className="w-5 h-5 text-blue-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{fileName}</p>
                  <p className="text-xs text-gray-500">{rows.length} rows found, {headers.length} columns</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    resetAll()
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={goToStep2}
                disabled={!fileName || rows.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Map Columns */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-500">NorthChat Field</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-500">CSV Column</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELDS.map((field) => (
                    <tr key={field.key} className="border-b border-gray-100 last:border-b-0">
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-900">
                          {field.label}
                          {field.required && <span className="text-red-500 ml-0.5">*</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={mapping[field.key]}
                          onChange={(e) => setMapping({ ...mapping, [field.key]: parseInt(e.target.value) })}
                          className={`w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            field.required && mapping[field.key] < 0
                              ? 'border-red-300'
                              : 'border-gray-300'
                          }`}
                        >
                          <option value={-1}>-- Skip --</option>
                          {headers.map((h, i) => (
                            <option key={i} value={i}>{h}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {mappingError && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {mappingError}
              </div>
            )}

            {/* Preview first 3 rows */}
            {rows.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Preview (first 3 rows)</h3>
                <div className="border border-gray-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {FIELDS.filter((f) => mapping[f.key] >= 0).map((f) => (
                          <th key={f.key} className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-500">{f.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 3).map((row, ri) => (
                        <tr key={ri} className="border-b border-gray-100 last:border-b-0">
                          {FIELDS.filter((f) => mapping[f.key] >= 0).map((f) => (
                            <td key={f.key} className="px-3 py-2 text-gray-700 truncate max-w-[200px]">
                              {row[mapping[f.key]] || ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={goToStep3}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Preview & Validate */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex gap-3">
              <div className="flex-1 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-2xl font-bold text-green-700">{validContacts.length}</p>
                <p className="text-sm text-green-600">Ready to import</p>
              </div>
              {invalidContacts.length > 0 && (
                <div className="flex-1 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-2xl font-bold text-red-700">{invalidContacts.length}</p>
                  <p className="text-sm text-red-600">Errors (will be skipped)</p>
                </div>
              )}
              {phoneWarnings.length > 0 && (
                <div className="flex-1 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-700">{phoneWarnings.length}</p>
                  <p className="text-sm text-yellow-600">Phone warnings</p>
                </div>
              )}
            </div>

            {/* Table */}
            <div className="border border-gray-200 rounded-xl overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-500 w-8"></th>
                    <th className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-500">Name</th>
                    <th className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-500">Company</th>
                    <th className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-500">Type</th>
                    <th className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-500">Phone</th>
                    <th className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-500">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {mappedContacts.map((c, i) => {
                    const hasNameError = !c.name.trim()
                    const hasPhoneWarning = c.phone.trim() && !validatePhone(c.phone)
                    return (
                      <tr key={i} className={`border-b border-gray-100 last:border-b-0 ${hasNameError ? 'bg-red-50' : ''}`}>
                        <td className="px-3 py-2">
                          {hasNameError ? (
                            <AlertCircle className="w-4 h-4 text-red-500" />
                          ) : hasPhoneWarning ? (
                            <AlertTriangle className="w-4 h-4 text-yellow-500" />
                          ) : null}
                        </td>
                        <td className={`px-3 py-2 ${hasNameError ? 'text-red-600 italic' : 'text-gray-900'}`}>
                          {c.name || '(missing)'}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{c.company}</td>
                        <td className="px-3 py-2 text-gray-700">{c.type}</td>
                        <td className={`px-3 py-2 ${hasPhoneWarning ? 'text-yellow-600' : 'text-gray-700'}`}>
                          {c.phone}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{c.email}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={doImport}
                disabled={validContacts.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Import {validContacts.length} Contacts
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Results */}
        {step === 4 && (
          <div className="space-y-6">
            {importing ? (
              <div className="text-center py-16">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" />
                <p className="text-sm font-medium text-gray-700">Importing contacts...</p>
                <p className="text-xs text-gray-400 mt-1">This may take a moment.</p>
              </div>
            ) : importError ? (
              <div className="text-center py-12">
                <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
                <p className="text-sm font-medium text-red-700">{importError}</p>
                <button
                  onClick={() => { setStep(3); setImportError('') }}
                  className="mt-4 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Go Back
                </button>
              </div>
            ) : result ? (
              <>
                <div className="text-center py-8">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="w-7 h-7 text-green-600" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Import Complete</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {result.imported} contact{result.imported !== 1 ? 's' : ''} imported successfully
                    {result.skipped > 0 && `, ${result.skipped} skipped`}
                  </p>
                </div>

                {result.skipped_contacts.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Skipped Contacts</h3>
                    <div className="border border-gray-200 rounded-xl overflow-hidden max-h-[250px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0">
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wide text-gray-500">Name</th>
                            <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wide text-gray-500">Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.skipped_contacts.map((sc, i) => (
                            <tr key={i} className="border-b border-gray-100 last:border-b-0">
                              <td className="px-4 py-2 text-gray-900">{sc.name}</td>
                              <td className="px-4 py-2 text-gray-500">{sc.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex justify-center gap-3 pt-2">
                  <button
                    onClick={() => router.push('/dashboard/contacts')}
                    className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    View Contacts
                  </button>
                  <button
                    onClick={resetAll}
                    className="px-5 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Import More
                  </button>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
