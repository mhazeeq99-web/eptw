import type { Metadata } from 'next'
import './about.css'
import AboutUsContent from './about-us-content'

export const metadata: Metadata = {
  title: 'ePTW | Electronic Permit to Work System Malaysia — Digital PTW Software',
  description:
    "ePTW is Malaysia's electronic Permit to Work system. Digitalise contractor PTW, HIRARC/JHA, approvals & audit trails. Free plan for small teams, Pro from RM149/month. Trusted by manufacturing, oil & gas, construction.",
  alternates: {
    canonical: 'https://www.eptw.com.my/about-us',
  },
  openGraph: {
    type: 'website',
    url: 'https://www.eptw.com.my/about-us',
    title: 'ePTW | Electronic Permit to Work System Malaysia',
    description:
      'Digitalise your Permit to Work process. Contractor PTW, HIRARC/JHA, digital approvals & complete audit trail. Malaysia\u2019s smart PTW solution.',
    images: ['https://www.eptw.com.my/og-image.jpg'],
    siteName: 'ePTW',
    locale: 'en_MY',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ePTW | Electronic Permit to Work System Malaysia',
    description:
      'Digitalise your Permit to Work process. Contractor PTW, HIRARC/JHA, digital approvals & complete audit trail.',
    images: ['https://www.eptw.com.my/og-image.jpg'],
  },
  other: {
    'keywords':
      'permit to work, ePTW, electronic permit to work, PTW system Malaysia, HIRARC, JHA, contractor PTW, digital permit, safety management, DOSH compliance, Malaysia',
    'geo.region': 'MY',
    'geo.placename': 'Malaysia',
    'geo.position': '3.1390;101.6869',
    ICBM: '3.1390, 101.6869',
  },
}

export default function AboutUsPage() {
  return <AboutUsContent />
}
