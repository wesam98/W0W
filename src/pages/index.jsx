import React from 'react';
import { Redirect } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';

export default function Home() {
  const authorUrl = useBaseUrl('/authors/wesam');
  return <Redirect to={authorUrl} />;
}