import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import MovieCard from '../components/MovieCard';
import Modal from '../components/Modal';
import { popularCollections } from '../data/collectionsData';
import { useTMDB } from '../hooks/useTMDB';
import './CollectionDetails.css';

const CollectionDetails = () => {
    const { id } = useParams();

    const { POSTER_URL, BACKDROP_URL, movieGenres, tvGenres, fetchCredits } = useTMDB();

    const [collection, setCollection] = useState(null);
    const [movies, setMovies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Find the collection from our data
    useEffect(() => {
        const foundCollection = popularCollections.find(c => c.id.toString() === id);
        if (foundCollection) {
            setCollection(foundCollection);
        } else {
            setError('Collection not found');
            setLoading(false);
        }
    }, [id]);

    // Fetch movie details for all movies in the collection
    useEffect(() => {
        if (!collection) return;

        const fetchMovies = async () => {
            setLoading(true);
            try {
                const moviePromises = collection.movieIds.map(async (movieId) => {
                    const response = await fetch(`/api/movie/${movieId}`);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch movie ${movieId}`);
                    }
                    return response.json();
                });

                const fetchedMovies = await Promise.all(moviePromises);
                // Add media_type to each movie for proper handling
                const moviesWithType = fetchedMovies.map(movie => ({
                    ...movie,
                    media_type: 'movie'
                }));
                setMovies(moviesWithType);
            } catch (err) {
                console.error('Error fetching collection movies:', err);
                setError('Failed to load movies');
            } finally {
                setLoading(false);
            }
        };

        fetchMovies();
    }, [collection]);

    const handleMovieClick = async (movie) => {
        const type = movie.media_type || 'movie';
        const genreMap = type === 'movie' ? movieGenres : tvGenres;
        const genreNames = movie.genre_ids?.map(id => genreMap.get(id)).filter(Boolean) ||
            movie.genres?.map(g => g.name) || [];
        const cast = await fetchCredits(type, movie.id);
        setSelectedItem({ ...movie, type, genres: genreNames, cast: cast.join(', ') || 'N/A' });
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedItem(null);
    };



    if (error) {
        return (
            <div className="collection-details-page">
                <div className="collection-error">
                    <h2>Error</h2>
                    <p>{error}</p>
                    <Link to="/" className="back-button">
                        Go Back
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="collection-details-page">
            {/* Hero Banner */}
            <div className="collection-hero">
                {collection && (
                    <>
                        <div className="collection-hero-backdrop">
                            <div className="collection-hero-gradient"></div>
                            <img
                                src={collection.backdrop}
                                alt={collection.name}
                                className="collection-hero-image"
                            />
                        </div>

                        <div className="collection-hero-content">
                            <Link to="/" className="back-button">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m12 19-7-7 7-7"></path>
                                    <path d="M19 12H5"></path>
                                </svg>
                                Back
                            </Link>

                            <h1 className="collection-title">{collection.name}</h1>
                            <p className="collection-description">{collection.description}</p>
                            <p className="collection-movie-count">{collection.movieCount} Movies</p>
                        </div>
                    </>
                )}
            </div>

            {/* Movies Grid */}
            <div className="collection-movies-container">
                <h2 className="collection-movies-heading">Movies in this Collection</h2>

                {loading ? (
                    <div className="collection-loading">
                        <div className="loading-spinner"></div>
                        <p>Loading movies...</p>
                    </div>
                ) : (
                    <div className="collection-movies-grid">
                        {movies.map(movie => (
                            <MovieCard
                                key={movie.id}
                                item={movie}
                                onClick={() => handleMovieClick(movie)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && selectedItem && (
                <Modal item={selectedItem} onClose={closeModal} />
            )}
        </div>
    );
};

export default CollectionDetails;
