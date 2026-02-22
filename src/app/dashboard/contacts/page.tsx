'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Plus, Phone, MessageSquare, Mail, StickyNote, ArrowDownLeft, ArrowUpRight, X, User, Building, Tag, Clock, Send, Pencil, Trash2, MapPin, Upload } from 'lucide-react'
import { useSoftphone } from '@/contexts/SoftphoneContext'
import { ClickablePhone } from '@/components/ui/clickable-phone'

// Types
interface ContactIdentifier {
  id: string
  identifier_type: string
  identifier_value: string
  is_primary: boolean
  system_source: string
}

interface ContactType {
  id: string
  name: string
}

interface Contact {
  id: string
  display_name: string
  contact_type_id: string
  contact_types: ContactType | null
  company_name: string | null
  group_type: string | null
  group_name: string | null
  notes: string | null
  tags: string[] | null
  address_street: string | null
  address_city: string | null
  address_state: string | null
  address_zip: string | null
  custom_field_label: string | null
  custom_field_value: string | null
  created_at: string
  contact_identifiers: ContactIdentifier[]
}

interface TimelineEvent {
  id: string
  type: string
  direction: string
  summary: string
  body?: string
  status?: string
  duration?: number
  author?: string
  time: string
}

// Color palette for type badges (cycles through these)
const typeColors = [
  { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' },
  { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
  { bg: '#FDF4FF', text: '#7E22CE', border: '#E9D5FF' },
  { bg: '#FEF2F2', text: '#B91C1C', border: '#FECACA' },
  { bg: '#FFFBEB', text: '#B45309', border: '#FDE68A' },
  { bg: '#F0FDFA', text: '#0F766E', border: '#99F6E4' },
]

function getTypeColor(index: number) {
  return typeColors[index % typeColors.length]
}

export default function ContactsPage() {
  const router = useRouter()
  const { triggerCall } = useSoftphone()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactTypes, setContactTypes] = useState<ContactType[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [loading, setLoading] = useState(true)
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Form state for new contact
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('')
  const [formCompany, setFormCompany] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formStreet, setFormStreet] = useState('')
  const [formCity, setFormCity] = useState('')
  const [formState, setFormState] = useState('')
  const [formZip, setFormZip] = useState('')
  const [formCustomLabel, setFormCustomLabel] = useState('')
  const [formCustomValue, setFormCustomValue] = useState('')

  // Panel resize state
  const [panelWidth, setPanelWidth] = useState(400)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartX = useRef(0)
  const resizeStartW = useRef(400)

  // Load saved panel width from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('northchat-contact-panel-width')
    if (stored) {
      const w = parseInt(stored, 10)
      if (w >= 350 && w <= 700) setPanelWidth(w)
    }
  }, [])

  // Resize drag handler
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    resizeStartX.current = e.clientX
    resizeStartW.current = panelWidth
  }, [panelWidth])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = resizeStartX.current - e.clientX
      const maxW = Math.min(700, window.innerWidth * 0.6)
      const newW = Math.max(350, Math.min(resizeStartW.current + delta, maxW))
      setPanelWidth(newW)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      localStorage.setItem('northchat-contact-panel-width', String(Math.round(panelWidth)))
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, panelWidth])

  const selected = contacts.find((c) => c.id === selectedId) || null

  // Load contact types on mount
  useEffect(() => {
    async function loadTypes() {
      try {
        const res = await fetch('/api/contact-types')
        const data = await res.json()
        if (data.types) {
          setContactTypes(data.types)
          // Set default form type to first type
          if (data.types.length > 0 && !formType) {
            setFormType(data.types[0].id)
          }
        }
      } catch (err) {
        console.error('Failed to load contact types:', err)
      }
    }
    loadTypes()
  }, [])

  // Load contacts
  useEffect(() => {
    loadContacts()
  }, [search, filterType])

  // Load timeline when contact is selected
  useEffect(() => {
    if (selectedId) {
      loadTimeline(selectedId)
    }
  }, [selectedId])

  // Close panel on Escape key
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && selectedId && !showAddModal && !showEditModal && !showDeleteConfirm) {
        setSelectedId(null)
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [selectedId, showAddModal, showEditModal, showDeleteConfirm])

  async function loadContacts() {
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (filterType !== 'all') params.set('type', filterType)

      const res = await fetch(`/api/contacts?${params.toString()}`)
      const data = await res.json()

      if (data.contacts) {
        setContacts(data.contacts)
      }
    } catch (err) {
      console.error('Failed to load contacts:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadTimeline(contactId: string) {
    setTimelineLoading(true)
    try {
      const res = await fetch(`/api/contacts/${contactId}/timeline`)
      const data = await res.json()
      setTimeline(data.timeline || [])
    } catch (err) {
      console.error('Failed to load timeline:', err)
      setTimeline([])
    } finally {
      setTimelineLoading(false)
    }
  }

  async function addNote() {
    if (!selectedId || !newNote.trim()) return
    setSavingNote(true)
    try {
      const res = await fetch(`/api/contacts/${selectedId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newNote.trim() }),
      })
      if (res.ok) {
        setNewNote('')
        // Reload timeline to show the new note
        await loadTimeline(selectedId)
      } else {
        const err = await res.json()
        alert(`Failed to add note: ${err.error}`)
      }
    } catch (err) {
      console.error('Failed to add note:', err)
    } finally {
      setSavingNote(false)
    }
  }

  async function createContact() {
    if (!formName.trim() || !formType) return
    setSaving(true)
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: formName.trim(),
          contact_type_id: formType,
          company_name: formCompany.trim() || null,
          phone: formPhone.trim() || null,
          email: formEmail.trim() || null,
          notes: formNotes.trim() || null,
          address_street: formStreet.trim() || null,
          address_city: formCity.trim() || null,
          address_state: formState || null,
          address_zip: formZip.trim() || null,
          custom_field_label: formCustomLabel.trim() || null,
          custom_field_value: formCustomValue.trim() || null,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setShowAddModal(false)
        resetForm()
        await loadContacts()
        // Select the new contact
        if (data.contact) {
          setSelectedId(data.contact.id)
        }
      } else {
        const err = await res.json()
        alert(`Failed to create contact: ${err.error}`)
      }
    } catch (err) {
      console.error('Failed to create contact:', err)
    } finally {
      setSaving(false)
    }
  }

  function openEditModal() {
    if (!selected) return
    const phone = selected.contact_identifiers?.find((i) => i.identifier_type === 'phone')
    const email = selected.contact_identifiers?.find((i) => i.identifier_type === 'email')
    setFormName(selected.display_name)
    setFormType(selected.contact_type_id)
    setFormCompany(selected.company_name || '')
    setFormPhone(phone?.identifier_value || '')
    setFormEmail(email?.identifier_value || '')
    setFormNotes(selected.notes || '')
    setFormStreet(selected.address_street || '')
    setFormCity(selected.address_city || '')
    setFormState(selected.address_state || '')
    setFormZip(selected.address_zip || '')
    setFormCustomLabel(selected.custom_field_label || '')
    setFormCustomValue(selected.custom_field_value || '')
    setShowEditModal(true)
  }

  async function updateContact() {
    if (!selected || !formName.trim() || !formType) return
    setSaving(true)
    try {
      const res = await fetch('/api/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selected.id,
          display_name: formName.trim(),
          contact_type_id: formType,
          company_name: formCompany.trim() || null,
          phone: formPhone.trim() || null,
          email: formEmail.trim() || null,
          notes: formNotes.trim() || null,
          address_street: formStreet.trim() || null,
          address_city: formCity.trim() || null,
          address_state: formState || null,
          address_zip: formZip.trim() || null,
          custom_field_label: formCustomLabel.trim() || null,
          custom_field_value: formCustomValue.trim() || null,
        }),
      })

      if (res.ok) {
        setShowEditModal(false)
        resetForm()
        await loadContacts()
      } else {
        const err = await res.json()
        alert(`Failed to update contact: ${err.error}`)
      }
    } catch (err) {
      console.error('Failed to update contact:', err)
    } finally {
      setSaving(false)
    }
  }

  async function deleteContact() {
    if (!selected) return
    setDeleting(true)
    try {
      const res = await fetch('/api/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id }),
      })

      if (res.ok) {
        setShowDeleteConfirm(false)
        setSelectedId(null)
        setTimeline([])
        await loadContacts()
      } else {
        const err = await res.json()
        alert(`Failed to delete contact: ${err.error}`)
      }
    } catch (err) {
      console.error('Failed to delete contact:', err)
    } finally {
      setDeleting(false)
    }
  }

  function resetForm() {
    setFormName('')
    setFormType(contactTypes.length > 0 ? contactTypes[0].id : '')
    setFormCompany('')
    setFormPhone('')
    setFormEmail('')
    setFormNotes('')
    setFormStreet('')
    setFormCity('')
    setFormState('')
    setFormZip('')
    setFormCustomLabel('')
    setFormCustomValue('')
  }

  function getContactPhone(contact: Contact): string | null {
    const primary = contact.contact_identifiers?.find(
      (i) => i.identifier_type === 'phone' && i.is_primary
    )
    if (primary) return primary.identifier_value
    const any = contact.contact_identifiers?.find((i) => i.identifier_type === 'phone')
    return any?.identifier_value || null
  }

  function getContactEmail(contact: Contact): string | null {
    const primary = contact.contact_identifiers?.find(
      (i) => i.identifier_type === 'email' && i.is_primary
    )
    if (primary) return primary.identifier_value
    const any = contact.contact_identifiers?.find((i) => i.identifier_type === 'email')
    return any?.identifier_value || null
  }

  function handleCall() {
    if (!selected) return
    const phone = getContactPhone(selected)
    if (!phone) { alert('This contact has no phone number.'); return }
    triggerCall(phone)
  }

  function handleSms() {
    if (!selected) return
    const phone = getContactPhone(selected)
    if (!phone) { alert('This contact has no phone number.'); return }
    const params = new URLSearchParams({ phone })
    params.set('name', selected.display_name)
    router.push(`/dashboard/messages?${params.toString()}`)
  }

  function handleEmail() {
    if (!selected) return
    const email = getContactEmail(selected)
    if (!email) { alert('This contact has no email address.'); return }
    window.open(`mailto:${email}`)
  }

  function formatPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '')
    if (digits.length === 11 && digits.startsWith('1')) {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
    }
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    }
    return phone
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffH = diffMs / (1000 * 60 * 60)
    if (diffH < 1) return `${Math.round(diffH * 60)}m ago`
    if (diffH < 24) return `${Math.round(diffH)}h ago`
    if (diffH < 48) return 'Yesterday'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // Build a map of type ID -> index for consistent colors
  const typeColorMap = new Map<string, number>()
  contactTypes.forEach((t, i) => typeColorMap.set(t.id, i))

  // Count contacts by type
  const typeCounts: Record<string, number> = { all: contacts.length }
  contactTypes.forEach((t) => {
    typeCounts[t.id] = contacts.filter((c) => c.contact_type_id === t.id).length
  })

  return (
    <div className="h-[calc(100vh-64px)] bg-white">
      {/* Left Panel - Contact List */}
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Contacts</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/dashboard/contacts/import')}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Import CSV
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-200">
          <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 placeholder-gray-400"
            />
          </div>
        </div>

        {/* Type Filters */}
        <div className="p-3 border-b border-gray-200 flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterType('all')}
            className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
              filterType === 'all'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            All ({typeCounts.all || 0})
          </button>
          {contactTypes.map((t) => (
            <button
              key={t.id}
              onClick={() => setFilterType(t.id)}
              className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                filterType === t.id
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {t.name} ({typeCounts[t.id] || 0})
            </button>
          ))}
        </div>

        {/* Contact List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading...</div>
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 px-4 text-center">
              <User className="w-10 h-10 mb-2" />
              <p className="text-sm">No contacts yet</p>
              <p className="text-xs mt-1">Click + Add to create your first contact</p>
            </div>
          ) : (
            contacts.map((contact) => {
              const colorIdx = typeColorMap.get(contact.contact_type_id) ?? 0
              const tc = getTypeColor(colorIdx)
              const typeName = contact.contact_types?.name || 'Unknown'
              const primaryPhone = contact.contact_identifiers?.find(
                (i) => i.identifier_type === 'phone' && i.is_primary
              )
              const isSelected = selectedId === contact.id

              return (
                <button
                  key={contact.id}
                  onClick={() => setSelectedId(contact.id)}
                  className={`w-full p-4 text-left border-b border-gray-100 transition-colors ${
                    isSelected ? 'bg-blue-50 border-l-2 border-l-blue-600' : 'hover:bg-gray-50 border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                        isSelected ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {contact.display_name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 truncate">
                          {contact.display_name}
                        </span>
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: tc.bg, color: tc.text, border: `1px solid ${tc.border}` }}
                        >
                          {typeName}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {primaryPhone
                          ? formatPhone(primaryPhone.identifier_value)
                          : contact.contact_identifiers?.[0]?.identifier_value || 'No contact info'}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Slide-over backdrop */}
      {selectedId && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity duration-200"
          onClick={() => setSelectedId(null)}
        />
      )}

      {/* Slide-over detail panel */}
      <div
        className={`fixed top-0 right-0 h-full z-40 w-full md:w-[var(--panel-w)] bg-white shadow-2xl border-l border-gray-200 transform flex flex-col overflow-hidden ${
          isResizing ? '' : 'transition-transform duration-200 ease-in-out'
        } ${
          selectedId ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ '--panel-w': `${panelWidth}px` } as React.CSSProperties}
      >
        {/* Resize handle (desktop only) */}
        <div
          onMouseDown={handleResizeStart}
          className="hidden md:flex absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize items-center justify-center z-10 group"
        >
          <div className="w-0.5 h-8 rounded-full bg-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {selected && (
          <>
          {/* Detail Header */}
          <div className="p-5 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white text-lg font-bold">
                {selected.display_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selected.display_name}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  {(() => {
                    const idx = typeColorMap.get(selected.contact_type_id) ?? 0
                    const sc = getTypeColor(idx)
                    return (
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded"
                        style={{ backgroundColor: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}
                      >
                        {selected.contact_types?.name || 'Unknown'}
                      </span>
                    )
                  })()}
                  {selected.company_name && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Building className="w-3 h-3" /> {selected.company_name}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={openEditModal}
                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Edit contact"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete contact"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="w-px h-5 bg-gray-200 mx-0.5" />
              <button
                onClick={() => setSelectedId(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Close panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="px-5 py-3 border-b border-gray-200 flex gap-2">
            {selected.contact_identifiers?.some((i) => i.identifier_type === 'phone') && (
              <>
                <button
                  onClick={handleCall}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Phone className="w-4 h-4" /> Call
                </button>
                <button
                  onClick={handleSms}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <MessageSquare className="w-4 h-4" /> SMS
                </button>
              </>
            )}
            {selected.contact_identifiers?.some((i) => i.identifier_type === 'email') && (
              <button
                onClick={handleEmail}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Mail className="w-4 h-4" /> Email
              </button>
            )}
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Contact Info */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Contact Info</h3>
              <div className="space-y-2.5">
                {selected.contact_identifiers?.map((id) => (
                  <div key={id.id} className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
                      {id.identifier_type === 'phone' ? <Phone className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {id.identifier_type === 'phone' ? <ClickablePhone phoneNumber={id.identifier_value} /> : id.identifier_value}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {id.identifier_type === 'phone' ? 'Phone' : 'Email'}
                        {id.is_primary ? ' · Primary' : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Address */}
            {(selected.address_street || selected.address_city || selected.address_state || selected.address_zip) && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Address</h3>
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 mt-0.5">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="text-sm text-gray-900 leading-relaxed">
                    {selected.address_street && <div>{selected.address_street}</div>}
                    <div>
                      {[selected.address_city, selected.address_state].filter(Boolean).join(', ')}
                      {selected.address_zip && ` ${selected.address_zip}`}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Custom Field */}
            {selected.custom_field_label && selected.custom_field_value && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">{selected.custom_field_label}</h3>
                <p className="text-sm text-gray-700 p-3 bg-gray-50 rounded-lg border border-gray-100">
                  {selected.custom_field_value}
                </p>
              </div>
            )}

            {/* Tags */}
            {selected.tags && selected.tags.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Tags</h3>
                <div className="flex gap-1.5 flex-wrap">
                  {selected.tags.map((tag, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
                      <Tag className="w-3 h-3" /> {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Notes field */}
            {selected.notes && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">About</h3>
                <p className="text-sm text-gray-700 leading-relaxed p-3 bg-gray-50 rounded-lg border border-gray-100">
                  {selected.notes}
                </p>
              </div>
            )}

            {/* Add Note */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Add a Note</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type a note about this contact..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && addNote()}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={savingNote}
                />
                <button
                  onClick={addNote}
                  disabled={savingNote || !newNote.trim()}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Activity Timeline */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Activity Timeline</h3>
              {timelineLoading ? (
                <div className="text-center py-8 text-gray-400 text-sm">Loading activity...</div>
              ) : timeline.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  No activity yet. Calls, SMS, and notes will appear here.
                </div>
              ) : (
                <div className="space-y-0">
                  {timeline.map((event) => (
                    <div key={event.id} className="flex gap-3 py-3 border-b border-gray-100 last:border-b-0">
                      {/* Icon */}
                      <div className="pt-0.5">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                            event.type === 'call'
                              ? 'bg-blue-50 text-blue-600'
                              : event.type === 'sms'
                              ? 'bg-green-50 text-green-600'
                              : 'bg-amber-50 text-amber-600'
                          }`}
                        >
                          {event.type === 'call' ? (
                            <Phone className="w-3.5 h-3.5" />
                          ) : event.type === 'sms' ? (
                            <MessageSquare className="w-3.5 h-3.5" />
                          ) : (
                            <StickyNote className="w-3.5 h-3.5" />
                          )}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {event.direction === 'inbound' ? (
                            <ArrowDownLeft className="w-3 h-3 text-green-500" />
                          ) : event.direction === 'outbound' ? (
                            <ArrowUpRight className="w-3 h-3 text-blue-500" />
                          ) : null}
                          <span className="text-xs font-semibold text-gray-700">
                            {event.type === 'call'
                              ? 'Call'
                              : event.type === 'sms'
                              ? 'SMS'
                              : 'Note'}
                            {event.type !== 'note' && ` · ${event.direction === 'inbound' ? 'Inbound' : 'Outbound'}`}
                            {event.author && ` by ${event.author}`}
                          </span>
                          {event.duration && (
                            <span className="text-[11px] text-gray-400">({formatDuration(event.duration)})</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">{event.summary}</p>
                      </div>

                      {/* Time */}
                      <div className="text-[11px] text-gray-400 whitespace-nowrap pt-0.5">
                        {formatTime(event.time)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          </>
        )}
      </div>

      {/* Add/Edit Contact Modal */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-[480px] max-h-[85vh] overflow-auto shadow-xl">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {showEditModal ? 'Edit Contact' : 'Add Contact'}
              </h2>
              <button
                onClick={() => { setShowAddModal(false); setShowEditModal(false); resetForm() }}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Type *</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {contactTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Company</label>
                <input
                  type="text"
                  value={formCompany}
                  onChange={(e) => setFormCompany(e.target.value)}
                  placeholder="Company name (optional)"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Additional notes about this contact..."
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm min-h-[70px] resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Address */}
              <div className="pt-2 border-t border-gray-100">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={formStreet}
                    onChange={(e) => setFormStreet(e.target.value)}
                    placeholder="Street address"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={formCity}
                      onChange={(e) => setFormCity(e.target.value)}
                      placeholder="City"
                      className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <select
                      value={formState}
                      onChange={(e) => setFormState(e.target.value)}
                      className="w-24 px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">State</option>
                      {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={formZip}
                      onChange={(e) => setFormZip(e.target.value)}
                      placeholder="ZIP"
                      className="w-24 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Custom Field */}
              <div className="pt-2 border-t border-gray-100">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Custom Field</label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={formCustomLabel}
                    onChange={(e) => setFormCustomLabel(e.target.value)}
                    placeholder="e.g. Gate Code"
                    className="w-40 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="text"
                    value={formCustomValue}
                    onChange={(e) => setFormCustomValue(e.target.value)}
                    placeholder="e.g. #1234"
                    className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => { setShowAddModal(false); setShowEditModal(false); resetForm() }}
                className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={showEditModal ? updateContact : createContact}
                disabled={saving || !formName.trim()}
                className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : showEditModal ? 'Update Contact' : 'Save Contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-[400px] shadow-xl">
            <div className="p-5 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Delete Contact</h2>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-600">
                Are you sure you want to delete <span className="font-semibold text-gray-900">{selected.display_name}</span>? This will also remove all their phone numbers and email addresses. This action cannot be undone.
              </p>
            </div>
            <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deleteContact}
                disabled={deleting}
                className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
