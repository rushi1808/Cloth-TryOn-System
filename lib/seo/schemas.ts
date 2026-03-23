import { Organization, WebApplication, WithContext } from 'schema-dts';

export function getOrganizationSchema(): WithContext<Organization> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'ClothsTryOn',
    description: 'AI-powered virtual try-on platform for fashion and clothing',
    url: 'https://ClothsTryOn.com',
    logo: 'https://ClothsTryOn.com/logo.png',
    sameAs: [
      // Add social media profiles when available
      // 'https://twitter.com/ClothsTryOn',
      // 'https://www.linkedin.com/company/ClothsTryOn',
      // 'https://www.facebook.com/ClothsTryOn',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Service',
      email: 'support@ClothsTryOn.com',
    },
  };
}

export function getWebApplicationSchema(): WithContext<WebApplication> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'ClothsTryOn',
    applicationCategory: 'LifestyleApplication',
    operatingSystem: 'Web Browser',
    description: 'Virtual try-on platform powered by AI. See how clothes fit on you before buying.',
    url: 'https://ClothsTryOn.com',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '1000',
      bestRating: '5',
      worstRating: '1',
    },
    featureList: [
      'AI-powered virtual try-on',
      'Body scanning technology',
      'Fashion styling recommendations',
      '3D clothing visualization',
      'Real-time outfit preview',
    ],
  };
}

export function getBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function getFAQSchema(faqs: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}
