import {
  IconDownload,
  IconScissors,
  IconArrowsExchange,
  IconArrowsMinimize,
  IconPhoto,
  IconSettings,
  IconHeadphones,
  type Icon
} from '@tabler/icons-react'

export type PageId =
  | 'downloads'
  | 'bg'
  | 'conv'
  | 'comp'
  | 'slide'
  | 'set'
  | 'sup'

export interface PageDef {
  id: PageId
  label: string
  icon: Icon
  group: 'Biblioteca' | 'Ferramentas' | 'Conta'
  title: string
  desc: string
}

export const PAGES: PageDef[] = [
  {
    id: 'downloads',
    label: 'Downloads',
    icon: IconDownload,
    group: 'Biblioteca',
    title: 'Downloads',
    desc: ''
  },
  {
    id: 'bg',
    label: 'Remover fundo',
    icon: IconScissors,
    group: 'Ferramentas',
    title: 'Remover fundo',
    desc: 'Arraste imagens ou um .zip. A IA local recorta o fundo com precisão, sem servidor e sem perda.'
  },
  {
    id: 'conv',
    label: 'Conversor',
    icon: IconArrowsExchange,
    group: 'Ferramentas',
    title: 'Conversor de formatos',
    desc: 'Arraste qualquer áudio, vídeo ou imagem. Converta entre MP3, MP4, WAV, FLAC, PNG, JPG e mais.'
  },
  {
    id: 'comp',
    label: 'Compressor',
    icon: IconArrowsMinimize,
    group: 'Ferramentas',
    title: 'Compressor inteligente',
    desc: 'Arraste arquivos para reduzir o tamanho — imperceptível em vídeo, 100% sem perda em imagem.'
  },
  {
    id: 'slide',
    label: 'Slideshow',
    icon: IconPhoto,
    group: 'Ferramentas',
    title: 'Slideshow',
    desc: 'Arraste fotos ou um .zip. Foto centralizada com fundo desfocado dela mesma, sem cortar. Você escolhe a resolução.'
  },
  {
    id: 'set',
    label: 'Configurações',
    icon: IconSettings,
    group: 'Conta',
    title: 'Configurações',
    desc: 'Pasta de downloads, qualidade padrão, paralelismo, idioma e atualizações.'
  },
  {
    id: 'sup',
    label: 'Suporte',
    icon: IconHeadphones,
    group: 'Conta',
    title: 'Suporte',
    desc: 'WhatsApp (61) 99243-7695 · suporteconnectionsound@gmail.com'
  }
]
