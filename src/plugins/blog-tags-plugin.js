export default function blogTagsPlugin(context, options) {
  return {
    name: 'blog-tags-plugin',
    async allContentLoaded({ allContent, actions }) {
      const { setGlobalData } = actions;

      const blogPlugin = allContent['docusaurus-plugin-content-blog'];
      const blogData = blogPlugin && Object.values(blogPlugin)[0];
      const tags = blogData?.blogTags || {};

      console.log('tags found:', Object.keys(tags));

      setGlobalData({ tags });
    },
  };
}