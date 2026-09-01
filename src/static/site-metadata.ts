interface ISiteMetadataResult {
  siteTitle: string;
  siteUrl: string;
  description: string;
  logo: string;
  navLinks: {
    name: string;
    url: string;
  }[];
}

const getBasePath = () => {
  const baseUrl = import.meta.env.BASE_URL;
  return baseUrl === '/' ? '' : baseUrl.replace(/\/+$/, '');
};

const data: ISiteMetadataResult = {
  siteTitle: 'Watson Running Page',
  siteUrl: 'https://run.watsonzhu.cn/',
  logo: `${getBasePath()}/images/logo.png`,
  description: "Watson's personal running platform",
  navLinks: [
    {
      name: 'Summary',
      url: `${getBasePath()}/summary`,
    },
    {
      name: 'Blog',
      url: 'https://bells.github.io/',
    },
    {
      name: 'About',
      url: 'https://github.com/bells/watson-running',
    },
  ],
};

export default data;
