'use client'

import { createContext, useContext, useState, useCallback } from 'react'

interface SoftphoneContextValue {
  dialNumber: string
  setDialNumber: (number: string) => void
  triggerCall: (number: string) => void
  isSoftphoneOpen: boolean
  setIsSoftphoneOpen: (open: boolean) => void
}

const SoftphoneContext = createContext<SoftphoneContextValue | null>(null)

export function SoftphoneProvider({ children }: { children: React.ReactNode }) {
  const [dialNumber, setDialNumber] = useState('')
  const [isSoftphoneOpen, setIsSoftphoneOpen] = useState(true)

  const triggerCall = useCallback((number: string) => {
    setDialNumber(number)
    setIsSoftphoneOpen(true)
  }, [])

  return (
    <SoftphoneContext.Provider
      value={{ dialNumber, setDialNumber, triggerCall, isSoftphoneOpen, setIsSoftphoneOpen }}
    >
      {children}
    </SoftphoneContext.Provider>
  )
}

export function useSoftphone(): SoftphoneContextValue {
  const context = useContext(SoftphoneContext)
  if (!context) {
    throw new Error('useSoftphone must be used within a SoftphoneProvider')
  }
  return context
}
