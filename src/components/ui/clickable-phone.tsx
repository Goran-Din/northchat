'use client'

import { Phone } from 'lucide-react'
import { useSoftphone } from '@/contexts/SoftphoneContext'

interface ClickablePhoneProps {
  phoneNumber: string
  className?: string
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

export function ClickablePhone({ phoneNumber, className }: ClickablePhoneProps) {
  const { triggerCall, deviceReady } = useSoftphone()

  function handleClick() {
    if (deviceReady) {
      triggerCall(phoneNumber)
    } else {
      alert('Phone not ready')
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`group inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline cursor-pointer ${className ?? ''}`}
    >
      {formatPhone(phoneNumber)}
      <Phone className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )
}
