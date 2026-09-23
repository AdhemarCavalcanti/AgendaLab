import { useState, useEffect } from 'react';

export function useFavoritos() {
  const [favoritos, setFavoritos] = useState<string[]>([]);

  useEffect(() => {
    const salvos = localStorage.getItem('@CuidadoOnline:favoritos');
    if (salvos) {
      setFavoritos(JSON.parse(salvos));
    }
  }, []);

  const toggleFavorito = (id: string) => {
    setFavoritos((atuais) => {
      const novos = atuais.includes(id)
        ? atuais.filter((favId) => favId !== id)
        : [...atuais, id];

      localStorage.setItem('@CuidadoOnline:favoritos', JSON.stringify(novos));
      return novos;
    });
  };

  return { favoritos, toggleFavorito };
}