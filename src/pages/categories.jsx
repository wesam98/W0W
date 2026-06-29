import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useGlobalData from '@docusaurus/useGlobalData';



export default function Categories() {
  const globalData = useGlobalData();
  console.log('ALL globalData keys:', Object.keys(globalData));



const tagsObj = globalData?.['blog-tags-plugin']?.default?.tags || {};
const tags = Object.values(tagsObj).map(tag => ({
  name: tag.label,
  permalink: tag.permalink,
  count: tag.items?.length ?? 0,
}));
  console.log('globalData:', globalData);

  return (
    <Layout title="Categories">
      <div style={{ maxWidth: 860, margin: '48px auto', padding: '0 24px' }}>
        <h1 style={{ marginBottom: 32 }}>Categories</h1>
        {tags.length === 0 && (
          <p>No categories found.</p>
        )}
        {tags.map((tag) => (
          <Link
            key={tag.name}
            to={tag.permalink}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '18px 24px',
              marginBottom: '12px',
              border: '1px solid var(--ifm-color-emphasis-300)',
              borderRadius: '8px',
              textDecoration: 'none',
              color: 'var(--ifm-color-primary)',
              fontSize: '1rem',
            }}>

              <span> {tag.name}</span>
              <span style={{ color: 'var(--ifm-color-emphasis-600)', marginLeft: '8px' }}>
                {tag.count} {tag.count === 1 ? 'post' : 'posts'} →
              </span>
          </Link>
        ))}
      </div>
    </Layout>
  );
}