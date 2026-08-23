import heroGreenhouse from '../../assets/hero_greenhouse.png'
import monstera from '../../assets/monstera.png'
import snakePlant from '../../assets/snake_plant.png'
import succulentGarden from '../../assets/succulent_garden.png'
import type { Plant } from '../../types/domain'

export const heroImage = heroGreenhouse
export const initialPlants: Plant[] = [
  { id: 1, name: 'Monstera Deliciosa', category: 'interior', price: 29.99, light: 'media', water: 'alta', pets: false, image: monstera, lightDesc: 'Luz indirecta', waterDesc: 'Riego moderado', petDesc: 'Tóxica para mascotas', description: 'Una planta tropical icónica con hermosas hojas recortadas. Perfecta para dar vida a cualquier rincón interior.', stock: 8, discount: 0 },
  { id: 2, name: 'Sansevieria (Planta Serpiente)', category: 'interior', price: 19.99, light: 'baja', water: 'baja', pets: false, image: snakePlant, lightDesc: 'Poca luz / Sombra', waterDesc: 'Poco riego', petDesc: 'Tóxica para mascotas', description: 'Casi indestructible y excelente purificadora de aire. Tolera poca luz y riegos muy distanciados.', stock: 1, discount: 0 },
  { id: 3, name: 'Jardín de Suculentas', category: 'suculentas', price: 34.99, light: 'alta', water: 'baja', pets: true, image: succulentGarden, lightDesc: 'Luz directa / Alta', waterDesc: 'Poco riego', petDesc: 'Segura para mascotas', description: 'Un hermoso arreglo artesanal de suculentas variadas en un cuenco minimalista. Ideal para escritorios soleados.', stock: 6, discount: 0 },
  { id: 4, name: 'Helecho de Boston', category: 'interior', price: 18.99, light: 'media', water: 'alta', pets: true, image: monstera, lightDesc: 'Luz media indirecta', waterDesc: 'Riego frecuente', petDesc: 'Segura para mascotas', description: 'Hojas plumosas y elegantes que cuelgan con gracia. Requiere humedad constante y luz tamizada.', stock: 3, discount: 0 },
  { id: 5, name: 'Cactus de Jade', category: 'suculentas', price: 15.99, light: 'alta', water: 'baja', pets: true, image: succulentGarden, lightDesc: 'Luz directa alta', waterDesc: 'Poco riego', petDesc: 'Segura para mascotas', description: 'Cactus de crecimiento lento, muy resistente y decorativo.', stock: 10, discount: 0 },
  { id: 6, name: 'Romero Aromático', category: 'exterior', price: 12.99, light: 'alta', water: 'baja', pets: true, image: snakePlant, lightDesc: 'Sol directo', waterDesc: 'Poco riego', petDesc: 'Segura para mascotas', description: 'Planta mediterránea aromática, perfecta para balcones soleados y para uso culinario.', stock: 2, discount: 0 },
  { id: 7, name: 'Buganvilla de Verano', category: 'exterior', price: 45.99, light: 'alta', water: 'alta', pets: false, image: heroGreenhouse, lightDesc: 'Sol directo pleno', waterDesc: 'Riego regular', petDesc: 'Tóxica para mascotas', description: 'Enredadera espectacular con abundantes flores. Llena de vida terrazas y patios.', stock: 7, discount: 0 },
  { id: 8, name: 'Palma de Salón (Chamaedorea)', category: 'interior', price: 22.99, light: 'media', water: 'alta', pets: true, image: monstera, lightDesc: 'Luz indirecta media', waterDesc: 'Riego regular', petDesc: 'Segura para mascotas', description: 'Palmera compacta y elegante que tolera condiciones variadas de interior.', stock: 4, discount: 0 },
]
