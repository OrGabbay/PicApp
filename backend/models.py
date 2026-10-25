from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    prompts = relationship("Prompt", back_populates="owner", cascade="all, delete-orphan")
    generations = relationship("Generation", back_populates="owner", cascade="all, delete-orphan")
    favorites = relationship("Favorite", back_populates="user", cascade="all, delete-orphan")

class Prompt(Base):
    __tablename__ = "prompts"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    original_text = Column(Text, nullable=False)
    enhanced_text = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="prompts")
    generations = relationship("Generation", back_populates="prompt", cascade="all, delete-orphan")

class Generation(Base):
    __tablename__ = "generations"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    prompt_id = Column(Integer, ForeignKey("prompts.id", ondelete="CASCADE"), nullable=False)
    image_url = Column(Text, nullable=False)
    engine = Column(String, nullable=True, default="Default")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="generations")
    prompt = relationship("Prompt", back_populates="generations")
    favorited_by = relationship("Favorite", back_populates="generation", cascade="all, delete-orphan")

class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("user_id", "generation_id", name="uq_user_generation"),)
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    generation_id = Column(Integer, ForeignKey("generations.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="favorites")
    generation = relationship("Generation", back_populates="favorited_by")