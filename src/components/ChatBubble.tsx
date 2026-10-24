// Plovoucí bublina vpravo dole, která otevře AI chat v popup okně. Chat zůstane zachovaný i po zavření.
import { useState } from 'react'
import { Icon } from './Icon'
import { AiChat } from './AiChat'

export function ChatBubble() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className={`fixed z-[55] right-3 md:right-6 bottom-[calc(88px+env(safe-area-inset-bottom))] md:bottom-6 w-[calc(100vw-24px)] md:w-[400px] h-[min(560px,calc(100dvh-180px))] md:h-[min(620px,calc(100dvh-60px))] bg-white border border-line rounded-[24px] shadow-[0_18px_50px_rgba(27,31,69,.25)] p-4 flex flex-col ${open ? '' : 'hidden'}`} role="dialog" aria-label="AI asistent">
        <AiChat onClose={() => setOpen(false)} onGo={() => { if (window.innerWidth < 768) setOpen(false) }} />
      </div>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Otevřít AI chat" title="Zeptat se AI"
          className="fixed z-[55] right-3 md:right-6 bottom-[calc(92px+env(safe-area-inset-bottom))] md:bottom-6 w-14 h-14 rounded-full bg-navy text-white shadow-[0_8px_24px_rgba(27,31,69,.35)] inline-flex items-center justify-center">
          <Icon name="sms" size={24} />
        </button>
      )}
    </>
  )
}
