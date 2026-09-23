// =========================================================================
// AgendaLab — Imagens Temáticas e Fallbacks dos Recursos
// =========================================================================

export interface RecursoImagemInfo {
  url: string
  alt: string
  gradienteFallback: string
  categoria: string
}

// Imagens temáticas otimizadas para ambientes acadêmicos e laboratoriais
const BANCO_IMAGENS: Record<string, string> = {
  // Salas
  maker: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=640&q=80',
  computacao: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=640&q=80',
  informatica: 'https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=640&q=80',
  quimica: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=640&q=80',
  fisica: 'https://images.unsplash.com/photo-1507668077129-56e32842fceb?auto=format&fit=crop&w=640&q=80',
  estudos: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=640&q=80',
  anfiteatro: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=640&q=80',
  auditorio: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=640&q=80',
  reuniao: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=640&q=80',
  salaPadrao: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=640&q=80',

  // Equipamentos
  projetor: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=640&q=80',
  multimetro: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=640&q=80',
  osciloscopio: 'https://images.unsplash.com/photo-1581092162384-8987c1d64718?auto=format&fit=crop&w=640&q=80',
  microscopio: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=640&q=80',
  kit: 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=640&q=80',
  impressora3d: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=640&q=80',
  equipamentoPadrao: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=640&q=80',
}

export function obterImagemRecurso(tipo: 'sala' | 'equipamento', nome: string): RecursoImagemInfo {
  const normalizado = (nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  if (tipo === 'sala') {
    if (normalizado.includes('maker') || normalizado.includes('prototipo') || normalizado.includes('robot')) {
      return {
        url: BANCO_IMAGENS.maker,
        alt: `Laboratório Maker - ${nome}`,
        gradienteFallback: 'from-amber-600/30 to-orange-500/20',
        categoria: 'Espaço Maker & Prototipagem',
      }
    }
    if (normalizado.includes('quimic') || normalizado.includes('bio') || normalizado.includes('saude')) {
      return {
        url: BANCO_IMAGENS.quimica,
        alt: `Laboratório de Química - ${nome}`,
        gradienteFallback: 'from-emerald-600/30 to-teal-500/20',
        categoria: 'Laboratório Químico/Biológico',
      }
    }
    if (normalizado.includes('fisic') || normalizado.includes('optica') || normalizado.includes('mecanic')) {
      return {
        url: BANCO_IMAGENS.fisica,
        alt: `Laboratório de Física - ${nome}`,
        gradienteFallback: 'from-indigo-600/30 to-cyan-500/20',
        categoria: 'Laboratório de Física e Ciências',
      }
    }
    if (normalizado.includes('anfiteatro') || normalizado.includes('auditorio')) {
      return {
        url: BANCO_IMAGENS.anfiteatro,
        alt: `Anfiteatro - ${nome}`,
        gradienteFallback: 'from-purple-600/30 to-pink-500/20',
        categoria: 'Auditório / Apresentações',
      }
    }
    if (normalizado.includes('estudo') || normalizado.includes('aula') || normalizado.includes('tutoria')) {
      return {
        url: BANCO_IMAGENS.estudos,
        alt: `Sala de Estudos - ${nome}`,
        gradienteFallback: 'from-cyan-600/30 to-blue-500/20',
        categoria: 'Espaço de Estudos e Pesquisa',
      }
    }
    if (normalizado.includes('info') || normalizado.includes('comput') || normalizado.includes('ti') || normalizado.includes('dados')) {
      return {
        url: BANCO_IMAGENS.informatica,
        alt: `Laboratório de Informática - ${nome}`,
        gradienteFallback: 'from-blue-600/30 to-cyan-500/20',
        categoria: 'Laboratório de Informática',
      }
    }
    return {
      url: BANCO_IMAGENS.salaPadrao,
      alt: `Sala - ${nome}`,
      gradienteFallback: 'from-slate-600/30 to-cyan-500/20',
      categoria: 'Sala de Uso Compartilhado',
    }
  }

  // Tipo Equipamento
  if (normalizado.includes('projetor') || normalizado.includes('hdmi') || normalizado.includes('video') || normalizado.includes('som')) {
    return {
      url: BANCO_IMAGENS.projetor,
      alt: `Projetor Audiovisual - ${nome}`,
      gradienteFallback: 'from-sky-600/30 to-indigo-500/20',
      categoria: 'Equipamento Audiovisual',
    }
  }
  if (normalizado.includes('multimetro') || normalizado.includes('voltimetro') || normalizado.includes('eletron')) {
    return {
      url: BANCO_IMAGENS.multimetro,
      alt: `Multímetro - ${nome}`,
      gradienteFallback: 'from-amber-600/30 to-yellow-500/20',
      categoria: 'Instrumento Eletrônico de Medição',
    }
  }
  if (normalizado.includes('osciloscopio') || normalizado.includes('bancada')) {
    return {
      url: BANCO_IMAGENS.osciloscopio,
      alt: `Osciloscópio - ${nome}`,
      gradienteFallback: 'from-emerald-600/30 to-cyan-500/20',
      categoria: 'Instrumento de Bancada',
    }
  }
  if (normalizado.includes('microscop') || normalizado.includes('lupa')) {
    return {
      url: BANCO_IMAGENS.microscopio,
      alt: `Microscópio - ${nome}`,
      gradienteFallback: 'from-teal-600/30 to-emerald-500/20',
      categoria: 'Equipamento Óptico',
    }
  }
  if (normalizado.includes('kit') || normalizado.includes('didatico') || normalizado.includes('arduino') || normalizado.includes('sensores')) {
    return {
      url: BANCO_IMAGENS.kit,
      alt: `Kit Didático - ${nome}`,
      gradienteFallback: 'from-blue-600/30 to-violet-500/20',
      categoria: 'Kit Experimental & Didático',
    }
  }
  if (normalizado.includes('3d') || normalizado.includes('impressora') || normalizado.includes('cnc')) {
    return {
      url: BANCO_IMAGENS.impressora3d,
      alt: `Impressora 3D - ${nome}`,
      gradienteFallback: 'from-orange-600/30 to-red-500/20',
      categoria: 'Manufatura Digital',
    }
  }

  return {
    url: BANCO_IMAGENS.equipamentoPadrao,
    alt: `Equipamento - ${nome}`,
    gradienteFallback: 'from-slate-600/30 to-amber-500/20',
    categoria: 'Equipamento Laboratorial',
  }
}

