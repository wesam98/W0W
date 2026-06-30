import React from 'react';
import { Redirect } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';

export default function Home() {
  const authorUrl = useBaseUrl('/posts/authors/wesam');
  return <Redirect to={authorUrl} />;
}