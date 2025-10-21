import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

type Contact = {
  id: number
  phoneNumber: string | null
  email: string | null
  linkedId: number | null
  linkPrecedence: string
  createdAt: string
  deletedAt: string | null
}

type IdentifyRequest = {
  email?: string | null
  phoneNumber?: string | null
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_URL || "",
  process.env.NEXT_PUBLIC_KEY || ""
)

export async function POST(req: NextRequest) {
    const rq: IdentifyRequest = await req.json()
    const { email, phoneNumber } = rq

    if (!email && !phoneNumber) {
      return NextResponse.json({ error: 'Email or phoneNumber must be porvided' })
    }

    let q = supabase.from('Contact').select('*').is('deletedAt', null)

    const filters = []
    
    const { data, error } = await q
    if (error) {
      return NextResponse.json({ error: 'Database retrieval failed' })
    }

    console.log("Query Data is-", data)

    if (!data || data.length == 0) {
      const { data: inserted, error: insertErr } = await supabase
        .from('Contact')
        .insert({
          email,
          phoneNumber,
          linkedId: null,
          linkPrecedence: 'primary'
        })
        .select()
        .single()

      if (insertErr || !inserted) {
        return NextResponse.json({ error: 'Error in creating contact' })
      }

      return NextResponse.json({
        contact: {
          primaryContactId: inserted.id,
          emails: inserted.email ? [inserted.email] : [],
          phoneNumbers: inserted.phoneNumber ? [inserted.phoneNumber] : [],
          secondaryContactIds: []
        }
      }, {status : 200})
    }

    const ids = new Set<number>()
    for (const c of data) {
      ids.add(c.id)
      if (c.linkedId) ids.add(c.linkedId)
    }

    const { data: rel, error: relErr } = await supabase
      .from('Contact')
      .select('*')
      .in('id', Array.from(ids))
      .is('deletedAt', null)

    if (relErr) {
      console.error('Error fetching related:', relErr)
      return NextResponse.json({ error: 'Database error' })
    }

    const { data: childContacts, error: childErr } = await supabase
      .from('Contact')
      .select('*')
      .in('linkedId', Array.from(ids))
      .is('deletedAt', null)

    if (childErr) {
      console.error('Child fetch failed:', childErr)
      return NextResponse.json({ error: 'Database error' })
    }

    const allConts = [...(rel || []), ...(childContacts || [])]
    const uniqContacts = []
    const seenIds = new Set()

    for (const contact of allConts) {
        if (!seenIds.has(contact.id)) {
            seenIds.add(contact.id)
            uniqContacts.push(contact)
        }
    }


    const primaries = uniqContacts
    .filter(c => c.linkPrecedence === 'primary')
    .sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime()
        const dateB = new Date(b.createdAt).getTime()
        return dateA - dateB
    })
    const mainContact = primaries[0]

    const sameCombo = uniqContacts.some(c => c.email === email && c.phoneNumber === phoneNumber)

    if (!sameCombo && email && phoneNumber) {
      const { data: newSec, error: secErr } = await supabase
        .from('Contact')
        .insert({
          email,
          phoneNumber,
          linkedId: mainContact.id,
          linkPrecedence: 'secondary'
        })
        .select()
        .single()

      if (!secErr && newSec) {
        uniqContacts.push(newSec)
      } else {
        console.warn('Tried linking new secondary but failed', secErr)
      }
    }

    if (primaries.length > 1) {
      const newerOnes = primaries.slice(1)
      for (const p of newerOnes) {
        await supabase
          .from('Contact')
          .update({
            linkedId: mainContact.id,
            linkPrecedence: 'secondary',
            updatedAt: new Date().toISOString()
          })
          .eq('id', p.id)

        await supabase
          .from('Contact')
          .update({
            linkedId: mainContact.id,
            updatedAt: new Date().toISOString()
          })
          .eq('linkedId', p.id)
      }

      const { data: refreshed } = await supabase
        .from('Contact')
        .select('*')
        .or(`id.eq.${mainContact.id},linkedId.eq.${mainContact.id}`)
        .is('deletedAt', null)

      if (refreshed) {
        uniqContacts.length = 0
        uniqContacts.push(...refreshed)
      }
    }

    const emails = new Set<string>()
    const phones = new Set<string>()
    const secIds: number[] = []

    if (mainContact.email) emails.add(mainContact.email)
    if (mainContact.phoneNumber) phones.add(mainContact.phoneNumber)

    const secondaryContacts = uniqContacts
    .filter(contact => contact.id !== mainContact.id)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))

    for (const contact of secondaryContacts) {
        if (contact.email) emails.add(contact.email)
        if (contact.phoneNumber) phones.add(contact.phoneNumber)
        secIds.push(contact.id)
    }
    let testCount = uniqContacts.length

    return NextResponse.json({
      contact: {
        primaryContactId: mainContact.id,
        emails: Array.from(emails),
        phoneNumbers: Array.from(phones),
        secondaryContactIds: secIds
      }
    })
}
