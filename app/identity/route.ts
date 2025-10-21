import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// type Contact = {
//   id: number
//   phoneNumber: string | null
//   email: string | null
//   linkedId: number | null
//   linkPrecedence: string
//   createdAt: string
//   deletedAt: string | null
// }

type IdentifyRequest = {
  email?: string | null
  phoneNumber?: string | null
}

const url = process.env.NEXT_PUBLIC_URL || "";
const key = process.env.NEXT_PUBLIC_KEY || "";

console.log("Env data:");
console.log(url);
console.log(key);

const supabase = createClient(url,key);

export async function POST(req: NextRequest) {

    const text = await req.json();
    console.log(text);
    const rq: IdentifyRequest = text;

    const { email, phoneNumber } = rq

    if (!email && !phoneNumber) {
      return NextResponse.json({ error: 'Email and phoneNumber not porvided' }, {status:400})
    }

    let q = supabase.from('Contact').select('*').is('deletedAt', null)
    
    const fltrs = []
    if (email) fltrs.push(`email.eq.${email}`)
    if (phoneNumber) fltrs.push(`phoneNumber.eq.${phoneNumber}`)
    
    if (fltrs.length > 0) {
      q = q.or(fltrs.join(','))
    }

    const { data, error } = await q
    if (error) {
      return NextResponse.json({ error: 'Database retrieval failed' })
    }

    console.log("query data is-", data)

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
        return NextResponse.json({ error: 'Error in creating contact' }, {status:500})
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
      return NextResponse.json({ error: 'Database error' }, {status:500})
    }

    const { data: childContacts, error: childErr } = await supabase
      .from('Contact')
      .select('*')
      .in('linkedId', Array.from(ids))
      .is('deletedAt', null)

    if (childErr) {
      console.error('Child fetch failed:', childErr)
      return NextResponse.json({ error: 'Database error' }, {status:500})
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

    const primes = uniqContacts
    .filter(c => c.linkPrecedence == 'primary')
    .sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime()
        const dateB = new Date(b.createdAt).getTime()
        return dateA - dateB
    })
    const mainContact = primes[0]

    let matchFound = false
    for (const contact of uniqContacts) {
        if (contact.email == email && contact.phoneNumber == phoneNumber) {
            matchFound = true
            break
        }
    }

    if (!matchFound && email && phoneNumber) {
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

    if (primes.length > 1) {
      const newOnes = primes.slice(1)
      for (const p of newOnes) {
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
    .filter(c => c.id != mainContact.id)
    .sort((a, b) => {
        const t1 = new Date(a.createdAt).getTime()
        const t2 = new Date(b.createdAt).getTime()
        return t1 - t2
    })

    for (const contact of secondaryContacts) {
        if (contact.email) emails.add(contact.email)
        if (contact.phoneNumber) phones.add(contact.phoneNumber)
        secIds.push(contact.id)
    }

    // let testCount = uniqContacts.length

    return NextResponse.json({
      contact: {
        primaryContactId: mainContact.id,
        emails: Array.from(emails),
        phoneNumbers: Array.from(phones),
        secondaryContactIds: secIds
      }
    }, { status: 200 })
}
