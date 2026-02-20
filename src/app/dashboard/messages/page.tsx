'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Send, MessageSquare, Plus, ArrowLeft, Phone } from 'lucide-react'

// Types
interface SmsMessage {
  id: string
  direction: string
  from_number: string
  to_number: string
  body: string
  status: string
  created_at: string
}

interface Conversation {
  phone_number: string
  last_message: string
  last_message_time: string
  unread_count: number
  contact_name?: string
}

export default function MessagesPage() {
  const supabase = createClient()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [newConversationNumber, setNewConversationNumber] = useState('')
  const [showNewConversation, setShowNewConversation] = useState(false)
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const twilioNumber = process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER || ''

  // Load conversations on mount
  useEffect(() => {
    loadConversations()

    // Poll for new messages every 5 seconds
    const interval = setInterval(() => {
      loadConversations()
      if (selectedConversation) {
        loadMessages(selectedConversation)
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [selectedConversation])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadConversations() {
    try {
      // Get all SMS messages, ordered by newest first
      const { data, error } = await supabase
        .from('sms_log')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to load conversations:', error.message)
        return
      }

      if (!data || data.length === 0) {
        setConversations([])
        setLoading(false)
        return
      }

      // Group messages by the "other party" phone number
      const conversationMap = new Map<string, Conversation>()

      data.forEach((msg: SmsMessage) => {
        // The other party is whoever isn't our Twilio number
        const otherNumber = msg.direction === 'inbound' ? msg.from_number : msg.to_number

        if (!conversationMap.has(otherNumber)) {
          conversationMap.set(otherNumber, {
            phone_number: otherNumber,
            last_message: msg.body || '',
            last_message_time: msg.created_at,
            unread_count: 0,
          })
        }
      })

      setConversations(Array.from(conversationMap.values()))
      setLoading(false)
    } catch (err) {
      console.error('Error loading conversations:', err)
      setLoading(false)
    }
  }

  async function loadMessages(phoneNumber: string) {
    try {
      // Get all messages with this phone number (both directions)
      const { data, error } = await supabase
        .from('sms_log')
        .select('*')
        .or(`from_number.eq.${phoneNumber},to_number.eq.${phoneNumber}`)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Failed to load messages:', error.message)
        return
      }

      setMessages(data || [])
    } catch (err) {
      console.error('Error loading messages:', err)
    }
  }

  async function sendMessage() {
    const targetNumber = showNewConversation ? newConversationNumber : selectedConversation
    if (!targetNumber || !newMessage.trim()) return

    setSending(true)

    try {
      // Get current user info
      const { data: { user } } = await supabase.auth.getUser()

      const response = await fetch('/api/twilio/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: targetNumber,
          body: newMessage.trim(),
          userId: user?.id || null,
        }),
      })

      const result = await response.json()

      if (result.success) {
        setNewMessage('')

        // If this was a new conversation, switch to it
        if (showNewConversation) {
          // Format the number the same way the API does
          let formatted = targetNumber.replace(/\D/g, '')
          if (formatted.length === 10) formatted = `+1${formatted}`
          else if (formatted.length === 11 && formatted.startsWith('1')) formatted = `+${formatted}`
          else if (!formatted.startsWith('+')) formatted = `+${formatted}`

          setShowNewConversation(false)
          setNewConversationNumber('')
          setSelectedConversation(formatted)
          await loadMessages(formatted)
        } else {
          // Reload messages for current conversation
          await loadMessages(targetNumber)
        }

        // Reload conversation list
        await loadConversations()
      } else {
        alert(`Failed to send: ${result.error}`)
      }
    } catch (err) {
      console.error('Error sending message:', err)
      alert('Failed to send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  function selectConversation(phoneNumber: string) {
    setSelectedConversation(phoneNumber)
    setShowNewConversation(false)
    loadMessages(phoneNumber)
  }

  function formatPhoneNumber(phone: string): string {
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
    const diffHours = diffMs / (1000 * 60 * 60)

    if (diffHours < 24) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    }
    if (diffHours < 168) {
      return date.toLocaleDateString('en-US', { weekday: 'short' })
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-white">
      {/* Left Panel - Conversation List */}
      <div className={`w-80 border-r border-gray-200 flex flex-col ${selectedConversation && 'hidden md:flex'}`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Messages</h2>
          <button
            onClick={() => {
              setShowNewConversation(true)
              setSelectedConversation(null)
              setMessages([])
            }}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="New message"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400">
              Loading...
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 px-4 text-center">
              <MessageSquare className="w-10 h-10 mb-2" />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs mt-1">Send your first message to get started</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.phone_number}
                onClick={() => selectConversation(conv.phone_number)}
                className={`w-full p-4 text-left hover:bg-gray-50 border-b border-gray-100 transition-colors ${
                  selectedConversation === conv.phone_number ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 text-sm">
                        {conv.contact_name || formatPhoneNumber(conv.phone_number)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatTime(conv.last_message_time)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 truncate mt-0.5">
                      {conv.last_message}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right Panel - Message Thread */}
      <div className={`flex-1 flex flex-col ${!selectedConversation && !showNewConversation && 'hidden md:flex'}`}>
        {showNewConversation ? (
          <>
            {/* New Conversation Header */}
            <div className="p-4 border-b border-gray-200 flex items-center gap-3">
              <button
                onClick={() => {
                  setShowNewConversation(false)
                  setNewConversationNumber('')
                }}
                className="md:hidden p-1 text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex-1">
                <label className="text-sm text-gray-500 block mb-1">To:</label>
                <input
                  type="tel"
                  placeholder="Enter phone number (e.g. 6305551234)"
                  value={newConversationNumber}
                  onChange={(e) => setNewConversationNumber(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
            </div>

            {/* Empty thread area */}
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 mx-auto mb-3" />
                <p>Enter a phone number and send your first message</p>
              </div>
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-gray-200">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={sending || !newConversationNumber}
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !newMessage.trim() || !newConversationNumber}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </>
        ) : selectedConversation ? (
          <>
            {/* Conversation Header */}
            <div className="p-4 border-b border-gray-200 flex items-center gap-3">
              <button
                onClick={() => setSelectedConversation(null)}
                className="md:hidden p-1 text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                <Phone className="w-5 h-5 text-gray-500" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">
                  {formatPhoneNumber(selectedConversation)}
                </h3>
                <p className="text-xs text-gray-400">SMS Conversation</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  No messages yet
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                        msg.direction === 'outbound'
                          ? 'bg-blue-600 text-white rounded-br-md'
                          : 'bg-white text-gray-900 border border-gray-200 rounded-bl-md'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                      <div className={`flex items-center gap-1 mt-1 ${
                        msg.direction === 'outbound' ? 'justify-end' : 'justify-start'
                      }`}>
                        <span className={`text-xs ${
                          msg.direction === 'outbound' ? 'text-blue-200' : 'text-gray-400'
                        }`}>
                          {new Date(msg.created_at).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                        {msg.direction === 'outbound' && msg.status && (
                          <span className="text-xs text-blue-200">
                            · {msg.status}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-gray-200 bg-white">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={sending}
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !newMessage.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </>
        ) : (
          /* No conversation selected */
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-600">Select a conversation</h3>
              <p className="text-sm mt-1">Choose from the list or start a new message</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
